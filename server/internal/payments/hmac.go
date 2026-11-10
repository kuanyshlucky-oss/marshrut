package payments

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// HMACJSON — общий формат подписанных уведомлений об оплате.
//
//	POST /api/payments/webhook/hmac
//	X-Signature: sha256=<hex(HMAC_SHA256(secret, тело запроса))>
//	{"event_id":"...","type":"payment.succeeded|payment.refunded|payment.failed","order_id":"...",
//	 "amount":3990,"currency":"KZT","provider_ref":"...","timestamp":1700000000}
//
// timestamp (unix, секунды) не должен отличаться от времени сервера больше чем на MaxSkew: старое уведомление
// повторно подставить нельзя. event_id уникален: повторная доставка не выдаёт доступ дважды (это делает сервер).
type HMACJSON struct {
	Secret         []byte
	PayURLTemplate string // https://pay.example/checkout?order={order_id}&amount={amount}&currency={currency}
	MaxSkew        time.Duration
}

func (h *HMACJSON) Name() string { return "hmac" }

func (h *HMACJSON) CreatePayment(_ context.Context, in Info) (Payment, error) {
	if h.PayURLTemplate == "" {
		return Payment{}, errors.New("не задан шаблон ссылки на оплату")
	}
	r := strings.NewReplacer(
		"{order_id}", url.QueryEscape(in.OrderID),
		"{amount}", strconv.FormatInt(in.Amount, 10),
		"{currency}", url.QueryEscape(in.Currency),
	)
	return Payment{RedirectURL: r.Replace(h.PayURLTemplate)}, nil
}

func (h *HMACJSON) ParseWebhook(r *http.Request, body []byte, now time.Time) (*Event, error) {
	sig := strings.TrimPrefix(strings.TrimSpace(r.Header.Get("X-Signature")), "sha256=")
	got, err := hex.DecodeString(sig)
	if err != nil || len(got) != sha256.Size {
		return nil, ErrBadSignature
	}
	mac := hmac.New(sha256.New, h.Secret)
	mac.Write(body)
	if !hmac.Equal(got, mac.Sum(nil)) {
		return nil, ErrBadSignature
	}
	var in struct {
		EventID     string `json:"event_id"`
		Type        string `json:"type"`
		OrderID     string `json:"order_id"`
		Amount      int64  `json:"amount"`
		Currency    string `json:"currency"`
		ProviderRef string `json:"provider_ref"`
		Timestamp   int64  `json:"timestamp"`
	}
	if err := json.Unmarshal(body, &in); err != nil || in.EventID == "" || in.OrderID == "" {
		return nil, ErrBadEvent
	}
	skew := h.MaxSkew
	if skew <= 0 {
		skew = 15 * time.Minute
	}
	if d := now.Sub(time.Unix(in.Timestamp, 0)); d > skew || d < -skew {
		return nil, ErrBadEvent
	}
	var kind EventKind
	switch in.Type {
	case "payment.succeeded":
		kind = Paid
	case "payment.refunded":
		kind = Refunded
	case "payment.failed":
		kind = Failed
	default:
		return nil, ErrBadEvent
	}
	return &Event{ID: in.EventID, Kind: kind, OrderID: in.OrderID, ProviderRef: in.ProviderRef, Amount: in.Amount, Currency: in.Currency}, nil
}
