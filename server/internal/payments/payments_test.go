package payments

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

var secret = []byte("test-webhook-secret-0123456789")

func sign(body string, key []byte) string {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(body))
	return "sha256=" + hex.EncodeToString(m.Sum(nil))
}

func hook(body, sig string) *http.Request {
	r := httptest.NewRequest("POST", "/api/payments/webhook/hmac", strings.NewReader(body))
	if sig != "" {
		r.Header.Set("X-Signature", sig)
	}
	return r
}

func goodBody(now time.Time, typ string) string {
	return `{"event_id":"evt-1","type":"` + typ + `","order_id":"ORDER123","amount":3990,"currency":"KZT","provider_ref":"p-1","timestamp":` + itoa(now.Unix()) + `}`
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for ; n > 0; n /= 10 {
		b = append([]byte{byte('0' + n%10)}, b...)
	}
	return string(b)
}

func TestHMACWebhook(t *testing.T) {
	h := &HMACJSON{Secret: secret, PayURLTemplate: "https://pay.example/c?o={order_id}&a={amount}&c={currency}", MaxSkew: 15 * time.Minute}
	now := time.Now()
	body := goodBody(now, "payment.succeeded")

	ev, err := h.ParseWebhook(hook(body, sign(body, secret)), []byte(body), now)
	if err != nil || ev.Kind != Paid || ev.ID != "evt-1" || ev.OrderID != "ORDER123" || ev.Amount != 3990 || ev.Currency != "KZT" || ev.ProviderRef != "p-1" {
		t.Fatalf("валидное уведомление: %+v err=%v", ev, err)
	}
	for typ, want := range map[string]EventKind{"payment.refunded": Refunded, "payment.failed": Failed} {
		b := goodBody(now, typ)
		if ev, err := h.ParseWebhook(hook(b, sign(b, secret)), []byte(b), now); err != nil || ev.Kind != want {
			t.Errorf("%s: %+v %v", typ, ev, err)
		}
	}

	bad := []struct {
		name string
		req  *http.Request
		body string
		want error
	}{
		{"нет подписи", hook(body, ""), body, ErrBadSignature},
		{"подпись мусор", hook(body, "sha256=zzzz"), body, ErrBadSignature},
		{"чужой секрет", hook(body, sign(body, []byte("another-secret-another-secret"))), body, ErrBadSignature},
		{"тело подменено после подписи", hook(strings.Replace(body, "3990", "1", 1), sign(body, secret)), strings.Replace(body, "3990", "1", 1), ErrBadSignature},
		{"подпись от пустого тела", hook(body, sign("", secret)), body, ErrBadSignature},
	}
	for _, c := range bad {
		if _, err := h.ParseWebhook(c.req, []byte(c.body), now); !errors.Is(err, c.want) {
			t.Errorf("%s: %v, ждали %v", c.name, err, c.want)
		}
	}

	// Подпись верна, но событие недопустимо: старое (повтор), из будущего, неизвестный тип, нет обязательных полей.
	old := goodBody(now.Add(-time.Hour), "payment.succeeded")
	future := goodBody(now.Add(time.Hour), "payment.succeeded")
	unknown := goodBody(now, "payment.weird")
	noOrder := `{"event_id":"e","type":"payment.succeeded","timestamp":` + itoa(now.Unix()) + `}`
	notJSON := `not json`
	for name, b := range map[string]string{"старое": old, "из будущего": future, "тип": unknown, "без order_id": noOrder, "не json": notJSON} {
		if _, err := h.ParseWebhook(hook(b, sign(b, secret)), []byte(b), now); !errors.Is(err, ErrBadEvent) {
			t.Errorf("%s: %v, ждали ErrBadEvent", name, err)
		}
	}
}

func TestHMACCreatePayment(t *testing.T) {
	h := &HMACJSON{Secret: secret, PayURLTemplate: "https://pay.example/c?o={order_id}&a={amount}&c={currency}"}
	p, err := h.CreatePayment(context.Background(), Info{OrderID: "AbC123", Amount: 3990, Currency: "KZT"})
	if err != nil || p.RedirectURL != "https://pay.example/c?o=AbC123&a=3990&c=KZT" {
		t.Fatalf("%+v %v", p, err)
	}
	// id заказа экранируется, а не подставляется как есть
	p, _ = h.CreatePayment(context.Background(), Info{OrderID: "a&b=c", Amount: 1, Currency: "KZT"})
	if strings.Contains(p.RedirectURL, "a&b=c") {
		t.Errorf("id заказа не экранирован: %s", p.RedirectURL)
	}
	if _, err := (&HMACJSON{Secret: secret}).CreatePayment(context.Background(), Info{}); err == nil {
		t.Error("без шаблона ссылки платёж не должен создаваться")
	}
}

func TestKaspiQR(t *testing.T) {
	k := &KaspiQR{QRImageURL: "https://x/qr.png", PayURL: "https://pay.kaspi.kz/x"}
	p, err := k.CreatePayment(context.Background(), Info{OrderID: "abcdef1234567890abcdef12", Amount: 3990, Currency: "KZT"})
	if err != nil || p.Instructions == nil || p.Instructions.Reference != "ABCDEF12" || p.Instructions.Amount != 3990 || p.Instructions.QRImageURL != "https://x/qr.png" || len(p.Instructions.Steps) < 3 {
		t.Fatalf("%+v %v", p, err)
	}
	if !strings.Contains(strings.Join(p.Instructions.Steps, " "), "3990") {
		t.Error("в шагах оплаты нет суммы")
	}
	if _, err := k.ParseWebhook(hook("{}", ""), []byte("{}"), time.Now()); !errors.Is(err, ErrNotSupported) {
		t.Errorf("Kaspi QR не присылает уведомлений: %v", err)
	}
}

func TestNewProvider(t *testing.T) {
	if p, err := New(Settings{}); err != nil || p.Name() != "kaspi_qr" {
		t.Errorf("по умолчанию kaspi_qr: %v %v", p, err)
	}
	if _, err := New(Settings{Provider: "hmac"}); err == nil {
		t.Error("hmac без секрета и шаблона должен отклоняться")
	}
	if _, err := New(Settings{Provider: "nope"}); err == nil {
		t.Error("неизвестный провайдер принят")
	}
	if p, err := New(Settings{Provider: "hmac", WebhookSecret: secret, PayURLTemplate: "https://x/{order_id}"}); err != nil || p.Name() != "hmac" {
		t.Errorf("hmac: %v %v", p, err)
	}
}
