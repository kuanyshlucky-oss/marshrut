//go:build integration

package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"testing"
	"time"

	"marshrut-api/internal/payments"
)

var tokenRe = regexp.MustCompile(`token=([A-Za-z0-9_-]+)`)

// outboxToken достаёт ссылку для пароля из последнего письма доступа покупателю.
func (e *env) outboxToken(email string) string {
	e.t.Helper()
	_, m := e.json("GET", "/api/admin/outbox", nil, admin())
	for _, x := range m["emails"].([]any) { // новые первыми
		em := x.(map[string]any)
		if em["to"] == email && strings.HasPrefix(em["kind"].(string), "access") {
			if mm := tokenRe.FindStringSubmatch(em["body"].(string)); mm != nil {
				return mm[1]
			}
		}
	}
	e.t.Fatalf("в очереди нет письма с токеном для %s", email)
	return ""
}

func (e *env) hasMail(to, kind string) bool {
	_, m := e.json("GET", "/api/admin/outbox", nil, admin())
	for _, x := range m["emails"].([]any) {
		em := x.(map[string]any)
		if em["to"] == to && em["kind"] == kind {
			return true
		}
	}
	return false
}

func (e *env) newOrder(email string) (string, map[string]any) {
	e.t.Helper()
	code, m := e.json("POST", "/api/shop/orders", map[string]any{"product": "gos-ru", "email": email, "name": "Покупатель", "acceptOffer": true, "consentImmediate": true}, ip("7.7.7.7"))
	if code != 200 {
		e.t.Fatalf("создание заказа: %d %v", code, m)
	}
	return m["orderId"].(string), m
}

func (e *env) meAccess(tok string) []any {
	e.t.Helper()
	_, me := e.json("GET", "/api/me", nil, bearer(tok))
	a, _ := me["access"].([]any)
	return a
}

func hasCode(list []any, c string) bool {
	for _, x := range list {
		if x == c {
			return true
		}
	}
	return false
}

func TestShopKaspiQRFlow(t *testing.T) {
	e := newEnvWith(t, func(_ context.Context, s *Server) {
		s.cfg.AdminNotifyEmail = "owner@e2e.kz"
		s.cfg.PublicSiteURL = "https://site.example"
		s.cfg.ProductPriceKZT, s.cfg.ProductDays, s.cfg.OfferVersion = 3990, 90, "1.0"
		s.payments = &payments.KaspiQR{QRImageURL: "https://site.example/qr.png"}
	})
	if code, m := e.json("GET", "/api/shop/products", nil); code != 200 || m["provider"] != "kaspi_qr" || len(m["products"].([]any)) != 1 {
		t.Fatalf("products: %d %v", code, m)
	}

	// Заказ без согласий, с кривым email и с неизвестным товаром не создаётся.
	for name, c := range map[string]struct {
		body map[string]any
		want int
	}{
		"нет обоих согласий":     {map[string]any{"product": "gos-ru", "email": "a@e2e.kz"}, 400},
		"нет согласия на доступ": {map[string]any{"product": "gos-ru", "email": "a@e2e.kz", "acceptOffer": true}, 400},
		"нет принятия оферты":    {map[string]any{"product": "gos-ru", "email": "a@e2e.kz", "consentImmediate": true}, 400},
		"кривой email":           {map[string]any{"product": "gos-ru", "email": "not-an-email", "acceptOffer": true, "consentImmediate": true}, 400},
		"email с именем":         {map[string]any{"product": "gos-ru", "email": "Bob <b@e2e.kz>", "acceptOffer": true, "consentImmediate": true}, 400},
		"неизвестный товар":      {map[string]any{"product": "nope", "email": "a@e2e.kz", "acceptOffer": true, "consentImmediate": true}, 404},
	} {
		if code, _ := e.json("POST", "/api/shop/orders", c.body); code != c.want {
			t.Errorf("%s: %d, ждали %d", name, code, c.want)
		}
	}

	orderID, created := e.newOrder("Buyer@E2E.kz") // email приводится к нижнему регистру
	ins := created["instructions"].(map[string]any)
	if ins["reference"] != strings.ToUpper(orderID[:8]) || ins["amount"].(float64) != 3990 || ins["qrImageUrl"] != "https://site.example/qr.png" {
		t.Fatalf("инструкции: %v", ins)
	}
	// Согласия сохранены как доказательство акцепта.
	var offerV, acceptedIP, email string
	var consent bool
	e.st.DB().QueryRow(`SELECT offer_version, accepted_ip, immediate_consent, email FROM orders WHERE id=$1`, orderID).Scan(&offerV, &acceptedIP, &consent, &email)
	if offerV != "1.0" || acceptedIP != "7.7.7.7" || !consent || email != "buyer@e2e.kz" {
		t.Errorf("акцепт: v=%s ip=%s consent=%v email=%s", offerV, acceptedIP, consent, email)
	}

	if _, st := e.json("GET", "/api/shop/orders/"+orderID, nil); st["status"] != "pending" || st["email"] != "b***@e2e.kz" || st["instructions"] == nil {
		t.Fatalf("статус: %v", st)
	}
	if code, _ := e.json("GET", "/api/shop/orders/short", nil); code != 404 {
		t.Errorf("кривой id заказа: %d", code)
	}

	// «Я оплатил» — только заявка: доступа нет, администратору ушло уведомление.
	if code, m := e.json("POST", "/api/shop/orders/"+orderID+"/claim", map[string]any{"payerHint": "Айдос, 1234"}); code != 200 || m["status"] != "claimed" {
		t.Fatalf("claim: %d %v", code, m)
	}
	if !e.hasMail("owner@e2e.kz", "admin_notify") {
		t.Error("администратору не ушло уведомление о заявке")
	}
	var users int
	e.st.DB().QueryRow(`SELECT COUNT(*) FROM users WHERE email='buyer@e2e.kz'`).Scan(&users)
	if users != 0 {
		t.Fatal("аккаунт создан до подтверждения оплаты")
	}

	// Админка закрыта без ключа; с ключом видна заявка.
	if code, _ := e.json("POST", "/api/admin/orders/confirm", map[string]any{"order_id": orderID}); code == 200 {
		t.Fatal("подтверждение заказа без админ-ключа")
	}
	if _, m := e.json("GET", "/api/admin/orders?status=claimed", nil, admin()); m["count"].(float64) != 1 {
		t.Errorf("список заявок: %v", m)
	}

	// Подтверждение: аккаунт, доступ, письмо; повтор безопасен.
	code, m := e.json("POST", "/api/admin/orders/confirm", map[string]any{"order_id": orderID}, admin())
	if code != 200 || m["new_user"] != true || m["duplicate"] != false || m["access_until"] == "" {
		t.Fatalf("confirm: %d %v", code, m)
	}
	if _, m2 := e.json("POST", "/api/admin/orders/confirm", map[string]any{"order_id": orderID}, admin()); m2["duplicate"] != true {
		t.Errorf("повторное подтверждение: %v", m2)
	}
	if code, _ := e.json("POST", "/api/shop/orders/"+orderID+"/claim", map[string]any{}); code != 409 {
		t.Errorf("заявка по оплаченному заказу: %d", code)
	}

	// Письмо со ссылкой; пароль никому не известен, пока покупатель его не задал.
	token := e.outboxToken("buyer@e2e.kz")
	_, ob := e.json("GET", "/api/admin/outbox", nil, admin())
	if !strings.Contains(ob["emails"].([]any)[0].(map[string]any)["body"].(string), "https://site.example/set-password.html?token=") && !e.hasMail("buyer@e2e.kz", "access") {
		t.Error("в письме нет ссылки на установку пароля")
	}
	if c, _ := e.login("buyer@e2e.kz", "guess-guess-1", ip("10.1.1.1")); c == 200 {
		t.Fatal("вход по угаданному паролю")
	}
	if code, _ := e.json("POST", "/api/auth/set-password", map[string]any{"token": token, "password": "short"}); code != 400 {
		t.Errorf("короткий пароль: %d", code)
	}
	if code, _ := e.json("POST", "/api/auth/set-password", map[string]any{"token": "wrong", "password": "long-enough-pw"}); code != 400 {
		t.Errorf("чужой токен: %d", code)
	}
	if code, m := e.json("POST", "/api/auth/set-password", map[string]any{"token": token, "password": "my-new-password"}); code != 200 {
		t.Fatalf("set-password: %d %v", code, m)
	}
	if code, _ := e.json("POST", "/api/auth/set-password", map[string]any{"token": token, "password": "another-password"}); code != 400 {
		t.Errorf("повторное использование ссылки: %d", code)
	}

	// Покупатель входит и пользуется тестом.
	c, tok := e.login("buyer@e2e.kz", "my-new-password", ip("10.1.1.2"))
	if c != 200 || !hasCode(e.meAccess(tok), "GOSSLUZHBA") {
		t.Fatalf("вход после установки пароля: %d", c)
	}
	if code, _, _ := e.newAttempt(tok, map[string]any{"kind": "gos", "code": "GOSSLUZHBA", "section": "mock", "contentLang": "ru"}); code != 200 {
		t.Errorf("пробный тест после покупки: %d", code)
	}
	if _, st := e.json("GET", "/api/shop/orders/"+orderID, nil); st["status"] != "paid" || st["instructions"] != nil {
		t.Errorf("статус оплаченного заказа: %v", st)
	}

	// Повторная отправка ссылки: новая ссылка работает, старые сессии завершаются.
	if code, _ := e.json("POST", "/api/admin/orders/resend", map[string]any{"order_id": orderID}, admin()); code != 200 {
		t.Fatalf("resend: %d", code)
	}
	if code, _ := e.json("POST", "/api/auth/set-password", map[string]any{"token": e.outboxToken("buyer@e2e.kz"), "password": "password-after-resend"}); code != 200 {
		t.Fatalf("set-password по новой ссылке: %d", code)
	}
	if code, _ := e.json("GET", "/api/me", nil, bearer(tok)); code != 401 {
		t.Errorf("старая сессия после смены пароля: %d, ждали 401", code)
	}

	// Возврат снимает доступ.
	if code, m := e.json("POST", "/api/admin/orders/refund", map[string]any{"order_id": orderID}, admin()); code != 200 || m["access_revoked"] != true {
		t.Fatalf("refund: %d %v", code, m)
	}
	_, tok2 := e.login("buyer@e2e.kz", "password-after-resend", ip("10.1.1.3"))
	if hasCode(e.meAccess(tok2), "GOSSLUZHBA") {
		t.Error("после возврата доступ остался")
	}
	if code, _, _ := e.newAttempt(tok2, map[string]any{"kind": "gos", "code": "GOSSLUZHBA", "section": "mock", "contentLang": "ru"}); code != 403 {
		t.Errorf("тест после возврата: %d, ждали 403", code)
	}
	if code, _ := e.json("POST", "/api/admin/orders/resend", map[string]any{"order_id": orderID}, admin()); code != 409 {
		t.Errorf("resend по возвращённому заказу: %d", code)
	}
	if code, _ := e.json("POST", "/api/admin/orders/confirm", map[string]any{"order_id": orderID}, admin()); code != 409 {
		t.Errorf("подтверждение возвращённого заказа: %d", code)
	}
}

func TestShopKaspiQRWebhookIsNotAvailable(t *testing.T) {
	e := newEnv(t)
	if code, _ := e.json("POST", "/api/payments/webhook/kaspi_qr", map[string]any{"x": 1}); code != 404 {
		t.Errorf("webhook у kaspi_qr: %d, ждали 404", code)
	}
	if code, _ := e.json("POST", "/api/payments/webhook/hmac", map[string]any{"x": 1}); code != 404 {
		t.Errorf("webhook чужого провайдера: %d, ждали 404", code)
	}
}

var whSecret = []byte("e2e-webhook-secret-0123456789")

func (e *env) webhook(typ, eventID, orderID string, amount int64, signWith []byte) (int, map[string]any) {
	e.t.Helper()
	body := fmt.Sprintf(`{"event_id":"%s","type":"%s","order_id":"%s","amount":%d,"currency":"KZT","provider_ref":"pay-%s","timestamp":%d}`,
		eventID, typ, orderID, amount, eventID, time.Now().Unix())
	m := hmac.New(sha256.New, signWith)
	m.Write([]byte(body))
	return e.json("POST", "/api/payments/webhook/hmac", json.RawMessage(body), header("X-Signature", "sha256="+hex.EncodeToString(m.Sum(nil))))
}

func TestShopHMACWebhookFlow(t *testing.T) {
	e := newEnvWith(t, func(_ context.Context, s *Server) {
		s.cfg.PublicSiteURL = "https://site.example"
		s.cfg.ProductPriceKZT, s.cfg.ProductDays = 3990, 90
		s.payments = &payments.HMACJSON{Secret: whSecret, PayURLTemplate: "https://pay.example/c?o={order_id}&a={amount}", MaxSkew: 15 * time.Minute}
	})
	orderID, created := e.newOrder("hook@e2e.kz")
	if u, _ := created["redirectUrl"].(string); u != "https://pay.example/c?o="+orderID+"&a=3990" {
		t.Fatalf("redirectUrl: %v", created["redirectUrl"])
	}
	if code, _ := e.json("POST", "/api/shop/orders/"+orderID+"/claim", map[string]any{}); code != 400 {
		t.Errorf("claim у провайдера с уведомлениями: %d, ждали 400", code)
	}

	countUsers := func() (n int) {
		e.st.DB().QueryRow(`SELECT COUNT(*) FROM users WHERE email='hook@e2e.kz'`).Scan(&n)
		return
	}
	// Подделка: чужой секрет, и верная подпись под другим телом. Доступа нет.
	if code, _ := e.webhook("payment.succeeded", "e0", orderID, 3990, []byte("attacker-secret-attacker-secret")); code != 401 {
		t.Errorf("подделанная подпись: %d, ждали 401", code)
	}
	if code, _ := e.json("POST", "/api/payments/webhook/hmac", map[string]any{"event_id": "x"}); code != 401 {
		t.Errorf("без подписи: %d, ждали 401", code)
	}
	if countUsers() != 0 {
		t.Fatal("доступ выдан по поддельному уведомлению")
	}

	// Сумма не совпала: доступ не выдан.
	if code, _ := e.webhook("payment.succeeded", "e1", orderID, 100, whSecret); code != 422 {
		t.Errorf("неверная сумма: %d, ждали 422", code)
	}
	if countUsers() != 0 {
		t.Fatal("доступ выдан при неверной сумме")
	}

	// Верная оплата: доступ выдан; повтор того же события и дубль под новым id безопасны.
	code, m := e.webhook("payment.succeeded", "e2", orderID, 3990, whSecret)
	if code != 200 || m["duplicate"] != false || countUsers() != 1 {
		t.Fatalf("оплата: %d %v users=%d", code, m, countUsers())
	}
	if _, m := e.webhook("payment.succeeded", "e2", orderID, 3990, whSecret); m["duplicate"] != true {
		t.Errorf("повтор события: %v", m)
	}
	if _, m := e.webhook("payment.succeeded", "e3", orderID, 3990, whSecret); m["duplicate"] != true {
		t.Errorf("дубль под новым id: %v", m)
	}
	var until string
	e.st.DB().QueryRow(`SELECT a.expires_at FROM test_access a JOIN users u ON u.id=a.user_id WHERE u.email='hook@e2e.kz'`).Scan(&until)
	if until != time.Now().UTC().AddDate(0, 0, 90).Format("2006-01-02") {
		t.Errorf("срок доступа продлён повторами: %q", until)
	}
	var mails int
	e.st.DB().QueryRow(`SELECT COUNT(*) FROM email_outbox WHERE to_email='hook@e2e.kz'`).Scan(&mails)
	if mails != 1 {
		t.Errorf("писем покупателю %d, ждали 1", mails)
	}

	// Неизвестный заказ; уведомление о неудаче не отзывает оплаченное.
	if code, _ := e.webhook("payment.succeeded", "e4", "NOSUCHORDERNOSUCHORDER12", 3990, whSecret); code != 404 {
		t.Errorf("неизвестный заказ: %d", code)
	}
	if code, _ := e.webhook("payment.failed", "e5", orderID, 3990, whSecret); code != 200 {
		t.Errorf("failed: %d", code)
	}
	if _, st := e.json("GET", "/api/shop/orders/"+orderID, nil); st["status"] != "paid" {
		t.Errorf("оплаченный заказ стал %v после failed", st["status"])
	}

	// Возврат по уведомлению снимает доступ.
	if code, m := e.webhook("payment.refunded", "e6", orderID, 3990, whSecret); code != 200 || m["duplicate"] != false {
		t.Fatalf("возврат: %d %v", code, m)
	}
	var n int
	e.st.DB().QueryRow(`SELECT COUNT(*) FROM test_access a JOIN users u ON u.id=a.user_id WHERE u.email='hook@e2e.kz'`).Scan(&n)
	if n != 0 {
		t.Error("после возврата доступ остался")
	}
	// Уведомление об оплате возвращённого заказа не воскрешает доступ.
	if code, _ := e.webhook("payment.succeeded", "e7", orderID, 3990, whSecret); code != 409 {
		t.Errorf("оплата возвращённого заказа: %d, ждали 409", code)
	}
}

func TestShopOrderRateLimited(t *testing.T) {
	e := newEnvWith(t, func(ctx context.Context, s *Server) { s.shopLimiter = newRateLimiter(ctx, 2, time.Hour) })
	for i := 0; i < 2; i++ {
		e.newOrder(fmt.Sprintf("u%d@e2e.kz", i))
	}
	if code, _ := e.json("POST", "/api/shop/orders", map[string]any{"product": "gos-ru", "email": "u9@e2e.kz", "acceptOffer": true, "consentImmediate": true}, ip("7.7.7.7")); code != 429 {
		t.Errorf("лимит заказов: %d, ждали 429", code)
	}
}
