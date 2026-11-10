package payments

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

// KaspiQR — оплата по QR продавца в приложении Kaspi.kz.
// Автоматического подтверждения нет (публичного API у Kaspi для сайтов нет): покупатель платит и нажимает
// «Я оплатил», продавец проверяет платёж в Kaspi Business и подтверждает заказ в админке.
type KaspiQR struct {
	QRImageURL string // картинка QR продавца
	PayURL     string // ссылка на оплату (необязательно)
}

func (k *KaspiQR) Name() string { return "kaspi_qr" }

func (k *KaspiQR) CreatePayment(_ context.Context, in Info) (Payment, error) {
	ref := Reference(in.OrderID)
	return Payment{Instructions: &Instructions{
		Kind: "kaspi_qr", QRImageURL: k.QRImageURL, PayURL: k.PayURL, Amount: in.Amount, Currency: in.Currency, Reference: ref,
		Steps: []string{
			"Откройте приложение Kaspi.kz и отсканируйте QR-код (или перейдите по ссылке на оплату).",
			fmt.Sprintf("Оплатите ровно %d ₸.", in.Amount),
			"Вернитесь на эту страницу и нажмите «Я оплатил».",
			"Доступ придёт на вашу почту сразу после того, как мы увидим платёж.",
		},
	}}, nil
}

func (k *KaspiQR) ParseWebhook(*http.Request, []byte, time.Time) (*Event, error) {
	return nil, ErrNotSupported
}
