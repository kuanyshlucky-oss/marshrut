//go:build integration

package store

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

var t0 = time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)

func mkOrder(t *testing.T, st *Store, id, email string, days int, amount int64) *Order {
	t.Helper()
	o := &Order{ID: id, Email: email, Product: "gos-ru", Code: "GOSSLUZHBA", Language: "ru", Days: days, Amount: amount,
		Provider: "kaspi_qr", OfferVersion: "1.0", AcceptedAt: nowStr(t0), AcceptedIP: "1.2.3.4", ImmediateConsent: true, CreatedAt: nowStr(t0)}
	if err := st.CreateOrder(context.Background(), o); err != nil {
		t.Fatal(err)
	}
	return o
}

func fulfill(t *testing.T, st *Store, id, event string, amount int64) *FulfillResult {
	t.Helper()
	r, err := st.FulfillOrder(context.Background(), FulfillInput{OrderID: id, Provider: "p", EventID: event, Amount: amount, Currency: "KZT",
		PasswordHash: "hash", Now: t0,
		Mail: func(o *Order, r *FulfillResult) (string, string) { return "Доступ", "token=" + r.SetupToken }})
	if err != nil {
		t.Fatalf("fulfill %s/%s: %v", id, event, err)
	}
	return r
}

func accessOf(t *testing.T, st *Store, uid int64) (string, bool) {
	t.Helper()
	var exp string
	err := st.DB().QueryRow(`SELECT expires_at FROM test_access WHERE user_id=$1 AND code='GOSSLUZHBA' AND language='ru'`, uid).Scan(&exp)
	if err != nil {
		return "", false
	}
	return exp, true
}

func TestFulfillNewUserCreatesAccountAccessAndMail(t *testing.T) {
	st := newStore(t)
	mkOrder(t, st, "o1", "buyer@e2e.kz", 90, 3990)
	r := fulfill(t, st, "o1", "e1", 3990)
	if !r.NewUser || r.UserID == 0 || r.AccessUntil != "2027-02-08" || r.SetupToken == "" || r.Duplicate || r.Mismatch {
		t.Fatalf("результат: %+v", r)
	}
	if exp, ok := accessOf(t, st, r.UserID); !ok || exp != "2027-02-08" {
		t.Errorf("доступ: %q %v", exp, ok)
	}
	o, _ := st.GetOrder(context.Background(), "o1")
	if o.Status != StatusPaid || o.UserID != r.UserID || o.PaidAt == "" {
		t.Errorf("заказ: %+v", o)
	}
	// В БД хранится только хеш токена, а письмо с самим токеном стоит в очереди.
	var n int
	st.DB().QueryRow(`SELECT COUNT(*) FROM password_setups WHERE token_hash = $1`, r.SetupToken).Scan(&n)
	if n != 0 {
		t.Error("токен лежит в БД открытым текстом")
	}
	st.DB().QueryRow(`SELECT COUNT(*) FROM password_setups WHERE token_hash = $1`, hashToken(r.SetupToken)).Scan(&n)
	if n != 1 {
		t.Error("нет записи с хешем токена")
	}
	mails, _ := st.PendingEmails(context.Background(), 10)
	if len(mails) != 1 || mails[0].To != "buyer@e2e.kz" || !strings.Contains(mails[0].Body, "token="+r.SetupToken) {
		t.Errorf("очередь писем: %+v", mails)
	}
}

func TestFulfillIsIdempotent(t *testing.T) {
	st := newStore(t)
	mkOrder(t, st, "o1", "buyer@e2e.kz", 90, 3990)
	first := fulfill(t, st, "o1", "e1", 3990)
	// 1) то же событие доставлено повторно
	again := fulfill(t, st, "o1", "e1", 3990)
	// 2) другое событие по уже оплаченному заказу (провайдер прислал дубль под новым id)
	other := fulfill(t, st, "o1", "e2", 3990)
	if !again.Duplicate || !other.Duplicate {
		t.Fatalf("повторы не распознаны: %+v %+v", again, other)
	}
	if exp, _ := accessOf(t, st, first.UserID); exp != "2027-02-08" {
		t.Errorf("повтор продлил доступ: %q", exp)
	}
	var users, mails int
	st.DB().QueryRow(`SELECT COUNT(*) FROM users WHERE email='buyer@e2e.kz'`).Scan(&users)
	st.DB().QueryRow(`SELECT COUNT(*) FROM email_outbox`).Scan(&mails)
	if users != 1 || mails != 1 {
		t.Errorf("пользователей %d, писем %d: ждали по одному", users, mails)
	}
}

func TestFulfillConcurrentWebhooks(t *testing.T) {
	st := newStore(t)
	mkOrder(t, st, "o1", "race@e2e.kz", 90, 3990)
	results := make(chan *FulfillResult, 8)
	for i := 0; i < 8; i++ {
		go func(i int) {
			r, err := st.FulfillOrder(context.Background(), FulfillInput{OrderID: "o1", Provider: "p", EventID: "same", Amount: 3990, Currency: "KZT", PasswordHash: "h", Now: t0})
			if err != nil {
				t.Error(err)
			}
			results <- r
		}(i)
	}
	fresh := 0
	for i := 0; i < 8; i++ {
		if r := <-results; r != nil && !r.Duplicate {
			fresh++
		}
	}
	if fresh != 1 {
		t.Fatalf("из 8 одновременных одинаковых уведомлений обработано %d, ждали 1", fresh)
	}
}

func TestFulfillAmountMismatchGivesNoAccess(t *testing.T) {
	st := newStore(t)
	mkOrder(t, st, "o1", "buyer@e2e.kz", 90, 3990)
	r := fulfill(t, st, "o1", "e1", 1) // заплатили 1 ₸ вместо 3990
	if !r.Mismatch {
		t.Fatalf("расхождение суммы не замечено: %+v", r)
	}
	var users int
	st.DB().QueryRow(`SELECT COUNT(*) FROM users WHERE email='buyer@e2e.kz'`).Scan(&users)
	o, _ := st.GetOrder(context.Background(), "o1")
	if users != 0 || o.Status != StatusPending {
		t.Errorf("при расхождении суммы выдан доступ: users=%d status=%s", users, o.Status)
	}
	// Верная оплата по тому же заказу после этого проходит (другое событие).
	if r := fulfill(t, st, "o1", "e2", 3990); r.Mismatch || r.Duplicate || r.UserID == 0 {
		t.Errorf("верная оплата после ошибочной: %+v", r)
	}
	// Валюта тоже сверяется.
	mkOrder(t, st, "o2", "other@e2e.kz", 90, 3990)
	rr, _ := st.FulfillOrder(context.Background(), FulfillInput{OrderID: "o2", Provider: "p", EventID: "c1", Amount: 3990, Currency: "USD", PasswordHash: "h", Now: t0})
	if !rr.Mismatch {
		t.Error("другая валюта принята")
	}
}

func TestFulfillExtendsExistingAccess(t *testing.T) {
	ctx := context.Background()
	st := newStore(t)
	uid := mustUser(t, st, "buyer@e2e.kz")
	// у пользователя уже есть доступ до 2026-12-01
	if err := st.GrantAccessUntil(ctx, uid, "GOSSLUZHBA", "ru", "2026-12-01"); err != nil {
		t.Fatal(err)
	}
	mkOrder(t, st, "o1", "buyer@e2e.kz", 90, 3990)
	r := fulfill(t, st, "o1", "e1", 3990)
	if r.NewUser || r.UserID != uid || r.SetupToken != "" || r.AccessUntil != "2027-03-01" {
		t.Fatalf("продление: %+v", r)
	}
	// бессрочный доступ остаётся бессрочным
	uid2 := mustUser(t, st, "vip@e2e.kz")
	_ = st.GrantAccessUntil(ctx, uid2, "GOSSLUZHBA", "ru", "")
	mkOrder(t, st, "o2", "vip@e2e.kz", 90, 3990)
	if r := fulfill(t, st, "o2", "e2", 3990); r.AccessUntil != "" {
		t.Errorf("бессрочный доступ получил срок: %q", r.AccessUntil)
	}
}

func TestFulfillUnknownAndRefundedOrder(t *testing.T) {
	ctx := context.Background()
	st := newStore(t)
	if _, err := st.FulfillOrder(ctx, FulfillInput{OrderID: "nope", Provider: "p", EventID: "e", Amount: 1, Currency: "KZT", PasswordHash: "h", Now: t0}); !errors.Is(err, ErrNotFound) {
		t.Errorf("неизвестный заказ: %v", err)
	}
	mkOrder(t, st, "o1", "buyer@e2e.kz", 90, 3990)
	fulfill(t, st, "o1", "e1", 3990)
	if _, err := st.RefundOrder(ctx, "o1", "p", "r1", "", t0); err != nil {
		t.Fatal(err)
	}
	if _, err := st.FulfillOrder(ctx, FulfillInput{OrderID: "o1", Provider: "p", EventID: "e9", Amount: 3990, Currency: "KZT", PasswordHash: "h", Now: t0}); !errors.Is(err, ErrOrderState) {
		t.Errorf("оплата по возвращённому заказу: %v", err)
	}
}

func TestRefundRevokesOrShortensAccess(t *testing.T) {
	ctx := context.Background()
	st := newStore(t)
	mkOrder(t, st, "o1", "buyer@e2e.kz", 90, 3990)
	r := fulfill(t, st, "o1", "e1", 3990)
	if _, err := st.RefundOrder(ctx, "o1", "p", "r1", "", t0); err != nil {
		t.Fatal(err)
	}
	if _, ok := accessOf(t, st, r.UserID); ok {
		t.Error("после возврата единственной покупки доступ остался")
	}
	if rr, err := st.RefundOrder(ctx, "o1", "p", "r2", "", t0); err != nil || !rr.Duplicate {
		t.Errorf("повторный возврат: %+v %v", rr, err)
	}

	// Две покупки: возврат второй сокращает доступ на её дни, первая остаётся.
	mkOrder(t, st, "a", "twice@e2e.kz", 90, 3990)
	mkOrder(t, st, "b", "twice@e2e.kz", 90, 3990)
	ra := fulfill(t, st, "a", "ea", 3990)
	fulfill(t, st, "b", "eb", 3990)
	if exp, _ := accessOf(t, st, ra.UserID); exp != "2027-05-09" {
		t.Fatalf("две покупки подряд: %q", exp)
	}
	rf, err := st.RefundOrder(ctx, "b", "p", "rb", "", t0)
	if err != nil || rf.Revoked || rf.AccessUntil != "2027-02-08" {
		t.Fatalf("возврат второй покупки: %+v %v", rf, err)
	}
	if exp, _ := accessOf(t, st, ra.UserID); exp != "2027-02-08" {
		t.Errorf("доступ после возврата второй: %q", exp)
	}
	// возврат неоплаченного заказа невозможен
	mkOrder(t, st, "c", "x@e2e.kz", 90, 3990)
	if _, err := st.RefundOrder(ctx, "c", "p", "rc", "", t0); !errors.Is(err, ErrOrderState) {
		t.Errorf("возврат неоплаченного: %v", err)
	}
}

func TestSetupTokenSingleUseAndExpiry(t *testing.T) {
	ctx := context.Background()
	st := newStore(t)
	mkOrder(t, st, "o1", "buyer@e2e.kz", 90, 3990)
	r := fulfill(t, st, "o1", "e1", 3990)

	if _, err := st.ConsumeSetupToken(ctx, "wrong-token", "h", t0); !errors.Is(err, ErrBadToken) {
		t.Errorf("чужой токен: %v", err)
	}
	if _, err := st.ConsumeSetupToken(ctx, r.SetupToken, "newhash", t0.Add(SetupTokenTTL+time.Minute)); !errors.Is(err, ErrBadToken) {
		t.Errorf("просроченный токен: %v", err)
	}
	uid, err := st.ConsumeSetupToken(ctx, r.SetupToken, "newhash", t0.Add(time.Hour))
	if err != nil || uid != r.UserID {
		t.Fatalf("токен: %d %v", uid, err)
	}
	var hash string
	st.DB().QueryRow(`SELECT password_hash FROM users WHERE id=$1`, uid).Scan(&hash)
	if hash != "newhash" {
		t.Errorf("пароль не изменён: %q", hash)
	}
	if _, err := st.ConsumeSetupToken(ctx, r.SetupToken, "other", t0.Add(2*time.Hour)); !errors.Is(err, ErrBadToken) {
		t.Errorf("повторное использование токена: %v", err)
	}
	// Новая ссылка (повторная отправка) работает независимо.
	tok2, err := st.CreateSetupToken(ctx, uid, t0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.ConsumeSetupToken(ctx, tok2, "again", t0.Add(time.Minute)); err != nil {
		t.Errorf("новая ссылка: %v", err)
	}
}

func TestClaimOrderStates(t *testing.T) {
	ctx := context.Background()
	st := newStore(t)
	mkOrder(t, st, "o1", "buyer@e2e.kz", 90, 3990)
	if err := st.ClaimOrder(ctx, "o1", "Айдос, 1234", t0); err != nil {
		t.Fatal(err)
	}
	o, _ := st.GetOrder(ctx, "o1")
	if o.Status != StatusClaimed || o.PayerHint != "Айдос, 1234" || o.ClaimedAt == "" {
		t.Fatalf("заявка: %+v", o)
	}
	// повторная заявка обновляет подсказку, но не время первой заявки
	_ = st.ClaimOrder(ctx, "o1", "Айдос, 5678", t0.Add(time.Hour))
	o, _ = st.GetOrder(ctx, "o1")
	if o.PayerHint != "Айдос, 5678" || o.ClaimedAt != nowStr(t0) {
		t.Errorf("повторная заявка: %+v", o)
	}
	if err := st.ClaimOrder(ctx, "missing", "", t0); !errors.Is(err, ErrNotFound) {
		t.Errorf("заявка по неизвестному заказу: %v", err)
	}
	fulfill(t, st, "o1", "e1", 3990)
	if err := st.ClaimOrder(ctx, "o1", "", t0); !errors.Is(err, ErrOrderState) {
		t.Errorf("заявка по оплаченному заказу: %v", err)
	}
}

func TestEmailOutbox(t *testing.T) {
	ctx := context.Background()
	st := newStore(t)
	_ = st.EnqueueEmail(ctx, "a@x.kz", "s1", "b1", "k", t0)
	_ = st.EnqueueEmail(ctx, "b@x.kz", "s2", "b2", "k", t0)
	p, _ := st.PendingEmails(ctx, 10)
	if len(p) != 2 {
		t.Fatalf("в очереди %d", len(p))
	}
	_ = st.MarkEmailSent(ctx, p[0].ID, t0)
	for i := 0; i < MaxEmailAttempts; i++ {
		_ = st.MarkEmailFailed(ctx, p[1].ID, "smtp down")
	}
	if left, _ := st.PendingEmails(ctx, 10); len(left) != 0 {
		t.Errorf("после отправки и исчерпания попыток в очереди %d", len(left))
	}
	all, _ := st.ListEmails(ctx, 10)
	if len(all) != 2 || all[0].LastError != "smtp down" {
		t.Errorf("список писем: %+v", all)
	}
	if n, err := st.PurgeOldEmails(ctx, time.Hour, t0.Add(48*time.Hour)); err != nil || n != 2 {
		t.Errorf("очистка: %d %v", n, err)
	}
}
