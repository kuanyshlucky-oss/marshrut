// Package payments — провайдеры оплаты за доступ. Провайдер делает две вещи: показывает покупателю, как заплатить
// (CreatePayment), и, если у него есть уведомления об оплате, проверяет их подлинность (ParseWebhook).
// Выдачу доступа, идемпотентность и возвраты делает не провайдер, а сервер.
//
// Реализации:
//   - KaspiQR — оплата по QR продавца в Kaspi. Публичного API у Kaspi для сайтов нет, уведомлений нет:
//     покупатель нажимает «Я оплатил», платёж проверяет и подтверждает администратор.
//   - HMACJSON — общий формат подписанных уведомлений для платёжного шлюза или агрегатора, у которого
//     есть webhooks. Формат документирован в README сервера. Конкретный провайдер подключается отдельным адаптером.
package payments

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

var (
	ErrBadSignature = errors.New("неверная подпись уведомления")
	ErrNotSupported = errors.New("провайдер не присылает уведомлений")
	ErrBadEvent     = errors.New("некорректное событие")
)

// Info — что нужно знать провайдеру о заказе.
type Info struct {
	OrderID  string
	Amount   int64
	Currency string
}

// Instructions — как заплатить вручную (оплата по QR).
type Instructions struct {
	Kind       string   `json:"kind"`
	QRImageURL string   `json:"qrImageUrl,omitempty"`
	PayURL     string   `json:"payUrl,omitempty"`
	Amount     int64    `json:"amount"`
	Currency   string   `json:"currency"`
	Reference  string   `json:"reference"` // короткий код заказа, по которому его находит продавец
	Steps      []string `json:"steps"`
}

type Payment struct {
	RedirectURL  string        `json:"redirectUrl,omitempty"`
	Ref          string        `json:"-"`
	Instructions *Instructions `json:"instructions,omitempty"`
}

type EventKind string

const (
	Paid     EventKind = "paid"
	Refunded EventKind = "refunded"
	Failed   EventKind = "failed"
)

// Event — проверенное уведомление провайдера.
type Event struct {
	ID          string
	Kind        EventKind
	OrderID     string
	ProviderRef string
	Amount      int64
	Currency    string
}

type Provider interface {
	Name() string
	CreatePayment(ctx context.Context, in Info) (Payment, error)
	// ParseWebhook проверяет подпись и разбирает уведомление. ErrBadSignature — подделка или чужой секрет.
	ParseWebhook(r *http.Request, body []byte, now time.Time) (*Event, error)
}

// Settings — настройки провайдера из конфигурации.
type Settings struct {
	Provider        string
	WebhookSecret   []byte
	PayURLTemplate  string
	KaspiQRImageURL string
	KaspiQRPayURL   string
}

func New(s Settings) (Provider, error) {
	switch s.Provider {
	case "kaspi_qr", "":
		return &KaspiQR{QRImageURL: s.KaspiQRImageURL, PayURL: s.KaspiQRPayURL}, nil
	case "hmac":
		if len(s.WebhookSecret) == 0 || s.PayURLTemplate == "" {
			return nil, errors.New("hmac: нужны секрет и шаблон ссылки на оплату")
		}
		return &HMACJSON{Secret: s.WebhookSecret, PayURLTemplate: s.PayURLTemplate, MaxSkew: 15 * time.Minute}, nil
	}
	return nil, fmt.Errorf("неизвестный провайдер оплаты %q", s.Provider)
}

// Reference — короткий код заказа для сверки платежа продавцом (первые 8 символов id заглавными).
func Reference(orderID string) string {
	if len(orderID) > 8 {
		orderID = orderID[:8]
	}
	return strings.ToUpper(orderID)
}
