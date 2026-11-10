package httpapi

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	netmail "net/mail"
	"regexp"
	"strings"
	"time"

	"marshrut-api/internal/auth"
	"marshrut-api/internal/payments"
	"marshrut-api/internal/store"
)

// Продажа доступа: заказ → оплата → подтверждение → выдача доступа (аккаунт, срок, письмо со ссылкой для пароля).
// Выдачу запускает только подтверждённая оплата: подписанное уведомление провайдера либо подтверждение администратора.

var orderIDRe = regexp.MustCompile(`^[A-Za-z0-9]{24}$`)

type product struct {
	ID       string `json:"id"`
	Code     string `json:"code"`
	Language string `json:"language"`
	Title    string `json:"title"`
	Days     int    `json:"days"`
	Amount   int64  `json:"amount"`
	Currency string `json:"currency"`
}

func (s *Server) products() []product {
	return []product{{
		ID: "gos-ru", Code: "GOSSLUZHBA", Language: "ru", Title: "Онлайн-тренажёр тестов: госслужба РК",
		Days: s.cfg.ProductDays, Amount: s.cfg.ProductPriceKZT, Currency: "KZT",
	}}
}

func (s *Server) productByID(id string) (product, bool) {
	for _, p := range s.products() {
		if p.ID == id {
			return p, true
		}
	}
	return product{}, false
}

// GET /api/shop/products
func (s *Server) handleShopProducts(w http.ResponseWriter, r *http.Request) {
	publicCache(w, 60)
	writeJSON(w, http.StatusOK, map[string]any{"products": s.products(), "offerVersion": s.cfg.OfferVersion, "provider": s.payments.Name()})
}

func validEmail(s string) bool {
	if len(s) == 0 || len(s) > maxEmailLen {
		return false
	}
	a, err := netmail.ParseAddress(s)
	return err == nil && a.Address == s && strings.Contains(s, "@") && !strings.ContainsAny(s, " <>\r\n")
}

func maskEmail(e string) string {
	at := strings.LastIndex(e, "@")
	if at < 1 {
		return ""
	}
	return e[:1] + "***" + e[at:]
}

func (s *Server) paymentInfo(o *store.Order) payments.Info {
	return payments.Info{OrderID: o.ID, Amount: o.Amount, Currency: o.Currency}
}

// POST /api/shop/orders {product, email, name?, acceptOffer, consentImmediate}
func (s *Server) handleCreateOrder(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Product          string `json:"product"`
		Email            string `json:"email"`
		Name             string `json:"name"`
		AcceptOffer      bool   `json:"acceptOffer"`
		ConsentImmediate bool   `json:"consentImmediate"`
	}
	if err := decode(w, r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "Неверный запрос")
		return
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if !validEmail(email) {
		writeError(w, http.StatusBadRequest, "Укажите корректный email: на него придёт доступ")
		return
	}
	// Без обоих согласий заказ не создаётся: они фиксируют акцепт оферты и согласие на немедленный доступ.
	if !in.AcceptOffer || !in.ConsentImmediate {
		writeError(w, http.StatusBadRequest, "Нужно принять условия публичной оферты и согласиться на немедленное предоставление доступа")
		return
	}
	p, ok := s.productByID(in.Product)
	if !ok || !s.content.Has(p.Code, p.Language) {
		writeError(w, http.StatusNotFound, "Товар не найден")
		return
	}
	now := time.Now()
	o := &store.Order{
		ID: auth.RandString(24), Email: email, Name: clip(in.Name, maxFieldLen), Product: p.ID, Code: p.Code, Language: p.Language,
		Days: p.Days, Amount: p.Amount, Currency: p.Currency, Provider: s.payments.Name(),
		OfferVersion: s.cfg.OfferVersion, AcceptedAt: now.UTC().Format(time.RFC3339), AcceptedIP: s.clientIP(r), ImmediateConsent: true,
		CreatedAt: now.UTC().Format(time.RFC3339),
	}
	if err := s.store.CreateOrder(r.Context(), o); err != nil {
		s.dbError(w, r, "создание заказа", err)
		return
	}
	pay, err := s.payments.CreatePayment(r.Context(), s.paymentInfo(o))
	if err != nil {
		_ = s.store.MarkOrderFailed(context.WithoutCancel(r.Context()), o.ID)
		s.log.Error("платёжный провайдер", "provider", o.Provider, "order", o.ID, "err", err)
		writeError(w, http.StatusBadGateway, "Платёжный сервис временно недоступен. Попробуйте позже.")
		return
	}
	if pay.Ref != "" {
		_ = s.store.SetProviderRef(r.Context(), o.ID, pay.Ref)
	}
	writeJSON(w, http.StatusOK, map[string]any{"orderId": o.ID, "status": o.Status, "amount": o.Amount, "currency": o.Currency, "days": o.Days,
		"redirectUrl": pay.RedirectURL, "instructions": pay.Instructions})
}

// GET /api/shop/orders/{id} — статус для страницы «Спасибо» (id неугадываем).
func (s *Server) handleOrderStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !orderIDRe.MatchString(id) {
		writeError(w, http.StatusNotFound, "Заказ не найден")
		return
	}
	o, err := s.store.GetOrder(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "Заказ не найден")
		return
	}
	if err != nil {
		s.dbError(w, r, "заказ", err)
		return
	}
	resp := map[string]any{"orderId": o.ID, "status": o.Status, "email": maskEmail(o.Email), "amount": o.Amount, "currency": o.Currency, "days": o.Days, "provider": o.Provider}
	if o.Status == store.StatusPending || o.Status == store.StatusClaimed {
		if pay, err := s.payments.CreatePayment(r.Context(), s.paymentInfo(o)); err == nil {
			resp["redirectUrl"], resp["instructions"] = pay.RedirectURL, pay.Instructions
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, resp)
}

// POST /api/shop/orders/{id}/claim {payerHint?} — «Я оплатил» (только для оплаты по QR). Это заявка, а не подтверждение:
// доступ выдаётся после проверки платежа администратором.
func (s *Server) handleClaimOrder(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !orderIDRe.MatchString(id) {
		writeError(w, http.StatusNotFound, "Заказ не найден")
		return
	}
	var in struct {
		PayerHint string `json:"payerHint"`
	}
	_ = decode(w, r, &in)
	o, err := s.store.GetOrder(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "Заказ не найден")
		return
	}
	if err != nil {
		s.dbError(w, r, "заказ", err)
		return
	}
	if o.Provider != "kaspi_qr" {
		writeError(w, http.StatusBadRequest, "Для этого способа оплаты подтверждение не требуется: доступ откроется сам")
		return
	}
	now := time.Now()
	if err := s.store.ClaimOrder(r.Context(), id, clip(in.PayerHint, 100), now); err != nil {
		if errors.Is(err, store.ErrOrderState) {
			writeError(w, http.StatusConflict, "Заказ уже обработан")
			return
		}
		s.dbError(w, r, "заявка об оплате", err)
		return
	}
	if o.Status == store.StatusPending && s.cfg.AdminNotifyEmail != "" { // уведомляем один раз, при первой заявке
		body := fmt.Sprintf("Новая заявка «Я оплатил».\n\nЗаказ: %s (код сверки %s)\nСумма: %d %s\nEmail покупателя: %s\nПодсказка плательщика: %s\n\nПроверьте платёж в Kaspi Business и подтвердите заказ в админке.",
			o.ID, payments.Reference(o.ID), o.Amount, o.Currency, o.Email, clip(in.PayerHint, 100))
		if err := s.store.EnqueueEmail(r.Context(), s.cfg.AdminNotifyEmail, "Заказ ждёт подтверждения оплаты", body, "admin_notify", now); err != nil {
			s.log.Warn("не удалось поставить в очередь уведомление администратору", "err", err)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": store.StatusClaimed})
}

// accessMail собирает письмо покупателю (выполняется внутри транзакции выдачи доступа).
func (s *Server) accessMail(o *store.Order, r *store.FulfillResult) (string, string) {
	until := "без ограничения срока"
	if r.AccessUntil != "" {
		until = "до " + r.AccessUntil
	}
	var b strings.Builder
	b.WriteString("Здравствуйте!\n\nОплата получена: доступ к онлайн-тренажёру тестов (госслужба РК) открыт " + until + ".\n\n")
	b.WriteString("Ваш логин: " + o.Email + "\n")
	if r.SetupToken != "" {
		b.WriteString("\nЗадайте пароль по ссылке (действует 7 дней, ссылка одноразовая):\n" + s.cfg.PublicSiteURL + "/set-password.html?token=" + r.SetupToken + "\n")
	} else {
		b.WriteString("\nВходите с вашим текущим паролем.\n")
	}
	b.WriteString("\nВход в тренажёр: " + s.cfg.PublicSiteURL + "/test.html\n")
	b.WriteString("\nУсловия возврата описаны в публичной оферте. Если письмо пришло по ошибке, просто проигнорируйте его.\n")
	return "Доступ к тренажёру тестов: госслужба РК", b.String()
}

// fulfill выдаёт доступ по подтверждённому платежу и пишет аудит. Повторные события безопасны.
func (s *Server) fulfill(ctx context.Context, orderID, provider, eventID, ref string, amount int64, currency, payload string) (*store.FulfillResult, error) {
	pw, err := auth.HashPassword(auth.RandString(40)) // у нового пользователя пароль неизвестен никому, его задаёт покупатель по ссылке
	if err != nil {
		return nil, err
	}
	return s.store.FulfillOrder(ctx, store.FulfillInput{
		OrderID: orderID, Provider: provider, EventID: eventID, ProviderRef: ref, Amount: amount, Currency: currency,
		Payload: payload, PasswordHash: pw, Now: time.Now(), Mail: s.accessMail,
	})
}

// POST /api/payments/webhook/{provider} — уведомление платёжного провайдера. Подпись проверяет провайдер; доступ
// выдаётся только по проверенному событию. 2xx отвечаем и на повторы (провайдер перестаёт их слать).
func (s *Server) handlePaymentWebhook(w http.ResponseWriter, r *http.Request) {
	if r.PathValue("provider") != s.payments.Name() {
		writeError(w, http.StatusNotFound, "Неизвестный провайдер")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Неверный запрос")
		return
	}
	ev, err := s.payments.ParseWebhook(r, body, time.Now())
	switch {
	case errors.Is(err, payments.ErrBadSignature):
		s.log.Warn("уведомление об оплате с неверной подписью", "ip", s.clientIP(r))
		writeError(w, http.StatusUnauthorized, "Неверная подпись")
		return
	case errors.Is(err, payments.ErrNotSupported):
		writeError(w, http.StatusNotFound, "Провайдер не присылает уведомлений")
		return
	case err != nil:
		writeError(w, http.StatusBadRequest, "Некорректное событие")
		return
	}
	ctx := context.WithoutCancel(r.Context())
	prov := s.payments.Name()
	switch ev.Kind {
	case payments.Paid:
		res, err := s.fulfill(ctx, ev.OrderID, prov, ev.ID, ev.ProviderRef, ev.Amount, ev.Currency, string(body))
		if errors.Is(err, store.ErrNotFound) {
			s.log.Warn("оплата по неизвестному заказу", "order", ev.OrderID)
			writeError(w, http.StatusNotFound, "Заказ не найден")
			return
		}
		if errors.Is(err, store.ErrOrderState) {
			s.log.Warn("оплата по заказу в неподходящем состоянии", "order", ev.OrderID)
			writeError(w, http.StatusConflict, "Заказ в другом состоянии")
			return
		}
		if err != nil {
			s.dbError(w, r, "выдача доступа", err)
			return
		}
		if res.Mismatch {
			s.log.Error("сумма оплаты не совпала с заказом: доступ не выдан", "order", ev.OrderID, "amount", ev.Amount, "currency", ev.Currency)
			writeError(w, http.StatusUnprocessableEntity, "Сумма не совпала с заказом")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "duplicate": res.Duplicate})
	case payments.Refunded:
		res, err := s.store.RefundOrder(ctx, ev.OrderID, prov, ev.ID, string(body), time.Now())
		if errors.Is(err, store.ErrNotFound) || errors.Is(err, store.ErrOrderState) {
			writeError(w, http.StatusConflict, "Возврат невозможен для этого заказа")
			return
		}
		if err != nil {
			s.dbError(w, r, "возврат", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "duplicate": res.Duplicate})
	case payments.Failed:
		if err := s.store.MarkOrderFailed(ctx, ev.OrderID); err != nil {
			s.dbError(w, r, "статус заказа", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
}

// POST /api/auth/set-password {token, password} — задать пароль по одноразовой ссылке из письма.
func (s *Server) handleSetPassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := decode(w, r, &in); err != nil || in.Token == "" || len(in.Token) > 200 {
		writeError(w, http.StatusBadRequest, "Неверный запрос")
		return
	}
	pw := strings.TrimSpace(in.Password)
	if len(pw) < minAdminPasswordLen {
		writeError(w, http.StatusBadRequest, "Пароль слишком короткий — минимум 8 символов")
		return
	}
	if len(pw) > auth.MaxPasswordLen {
		writeError(w, http.StatusBadRequest, "Пароль слишком длинный — максимум 72 байта")
		return
	}
	hash, err := auth.HashPassword(pw)
	if err != nil {
		s.dbError(w, r, "хеш пароля", err)
		return
	}
	uid, err := s.store.ConsumeSetupToken(r.Context(), in.Token, hash, time.Now())
	if errors.Is(err, store.ErrBadToken) {
		writeError(w, http.StatusBadRequest, "Ссылка недействительна или устарела. Запросите новую.")
		return
	}
	if err != nil {
		s.dbError(w, r, "установка пароля", err)
		return
	}
	// Смена пароля завершает все прежние сессии аккаунта.
	if err := s.store.SetSessionID(r.Context(), uid, auth.SentinelLoggedOut); err != nil {
		s.log.Warn("не удалось завершить сессии после установки пароля", "err", err)
	}
	s.sessions.Drop(uid)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

/* ---------- Админка ---------- */

// GET /api/admin/orders?status=
func (s *Server) handleAdminOrders(w http.ResponseWriter, r *http.Request) {
	st := r.URL.Query().Get("status")
	if st != "" && st != store.StatusPending && st != store.StatusClaimed && st != store.StatusPaid && st != store.StatusFailed && st != store.StatusRefunded {
		writeError(w, http.StatusBadRequest, "Неизвестный статус")
		return
	}
	list, err := s.store.ListOrders(r.Context(), st, 200)
	if err != nil {
		s.dbError(w, r, "список заказов", err)
		return
	}
	out := make([]map[string]any, len(list))
	for i, o := range list {
		out[i] = map[string]any{"order": o, "reference": payments.Reference(o.ID)}
	}
	writeJSON(w, http.StatusOK, map[string]any{"count": len(list), "orders": out})
}

func (s *Server) decodeOrderID(w http.ResponseWriter, r *http.Request) (string, bool) {
	var in struct {
		OrderID string `json:"order_id"`
	}
	if err := decode(w, r, &in); err != nil || !orderIDRe.MatchString(in.OrderID) {
		writeError(w, http.StatusBadRequest, "Неверный order_id")
		return "", false
	}
	return in.OrderID, true
}

// POST /api/admin/orders/confirm {order_id} — администратор проверил платёж (например, в Kaspi Business): выдать доступ.
func (s *Server) handleAdminConfirmOrder(w http.ResponseWriter, r *http.Request) {
	id, ok := s.decodeOrderID(w, r)
	if !ok {
		return
	}
	o, err := s.store.GetOrder(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "Заказ не найден")
		return
	}
	if err != nil {
		s.dbError(w, r, "заказ", err)
		return
	}
	if o.Status == store.StatusRefunded { // повтор события не должен маскировать возврат
		writeError(w, http.StatusConflict, "Заказ в другом состоянии (возможно, возвращён)")
		return
	}
	res, err := s.fulfill(r.Context(), id, "manual", "confirm:"+id, "", o.Amount, o.Currency, "confirmed by admin")
	if errors.Is(err, store.ErrOrderState) {
		writeError(w, http.StatusConflict, "Заказ в другом состоянии (возможно, возвращён)")
		return
	}
	if err != nil {
		s.dbError(w, r, "подтверждение заказа", err)
		return
	}
	s.audit(r, "confirm_order", id, fmt.Sprintf("user_id=%d until=%s new_user=%v duplicate=%v", res.UserID, res.AccessUntil, res.NewUser, res.Duplicate))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "duplicate": res.Duplicate, "user_id": res.UserID, "new_user": res.NewUser, "access_until": res.AccessUntil})
}

// POST /api/admin/orders/refund {order_id}
func (s *Server) handleAdminRefundOrder(w http.ResponseWriter, r *http.Request) {
	id, ok := s.decodeOrderID(w, r)
	if !ok {
		return
	}
	res, err := s.store.RefundOrder(r.Context(), id, "manual", "refund:"+id, "refunded by admin", time.Now())
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "Заказ не найден")
		return
	}
	if errors.Is(err, store.ErrOrderState) {
		writeError(w, http.StatusConflict, "Вернуть можно только оплаченный заказ")
		return
	}
	if err != nil {
		s.dbError(w, r, "возврат", err)
		return
	}
	s.audit(r, "refund_order", id, fmt.Sprintf("revoked=%v until=%s duplicate=%v", res.Revoked, res.AccessUntil, res.Duplicate))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "duplicate": res.Duplicate, "access_revoked": res.Revoked, "access_until": res.AccessUntil})
}

// POST /api/admin/orders/resend {order_id} — новая ссылка для установки пароля и письмо покупателю.
func (s *Server) handleAdminResendAccess(w http.ResponseWriter, r *http.Request) {
	id, ok := s.decodeOrderID(w, r)
	if !ok {
		return
	}
	o, err := s.store.GetOrder(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "Заказ не найден")
		return
	}
	if err != nil {
		s.dbError(w, r, "заказ", err)
		return
	}
	if o.Status != store.StatusPaid || o.UserID == 0 {
		writeError(w, http.StatusConflict, "Письмо можно отправить только по оплаченному заказу")
		return
	}
	now := time.Now()
	tok, err := s.store.CreateSetupToken(r.Context(), o.UserID, now)
	if err != nil {
		s.dbError(w, r, "ссылка для пароля", err)
		return
	}
	subj, body := s.accessMail(o, &store.FulfillResult{SetupToken: tok})
	if err := s.store.EnqueueEmail(r.Context(), o.Email, subj, body, "access_resend", now); err != nil {
		s.dbError(w, r, "очередь писем", err)
		return
	}
	s.audit(r, "resend_access", id, "user_id="+fmt.Sprint(o.UserID))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// GET /api/admin/outbox — очередь писем (если почта не настроена, ссылки для покупателей берутся отсюда).
func (s *Server) handleAdminOutbox(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListEmails(r.Context(), 100)
	if err != nil {
		s.dbError(w, r, "очередь писем", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"smtp_configured": s.mailer != nil, "emails": list})
}
