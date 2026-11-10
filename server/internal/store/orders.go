package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"
)

// Заказы и выдача доступа после оплаты. Всё, что меняет деньги/доступ, делается в одной транзакции
// с блокировкой строки заказа, а каждое платёжное событие обрабатывается один раз (payment_events).

var (
	ErrOrderState = errors.New("заказ в другом состоянии")
	ErrBadToken   = errors.New("ссылка недействительна или устарела")
)

const (
	StatusPending  = "pending"
	StatusClaimed  = "claimed"
	StatusPaid     = "paid"
	StatusFailed   = "failed"
	StatusRefunded = "refunded"

	// SetupTokenTTL — срок жизни ссылки «задайте пароль».
	SetupTokenTTL = 7 * 24 * time.Hour
)

type Order struct {
	ID               string `json:"id"`
	Email            string `json:"email"`
	Name             string `json:"name"`
	Product          string `json:"product"`
	Code             string `json:"code"`
	Language         string `json:"language"`
	Days             int    `json:"days"`
	Amount           int64  `json:"amount"`
	Currency         string `json:"currency"`
	Status           string `json:"status"`
	Provider         string `json:"provider"`
	ProviderRef      string `json:"provider_ref"`
	OfferVersion     string `json:"offer_version"`
	AcceptedAt       string `json:"accepted_at"`
	AcceptedIP       string `json:"accepted_ip"`
	ImmediateConsent bool   `json:"immediate_consent"`
	PayerHint        string `json:"payer_hint"`
	ClaimedAt        string `json:"claimed_at"`
	UserID           int64  `json:"user_id"`
	CreatedAt        string `json:"created_at"`
	PaidAt           string `json:"paid_at"`
	RefundedAt       string `json:"refunded_at"`
}

const orderCols = `id, email, name, product, code, language, days, amount, currency, status, provider, provider_ref,
	offer_version, accepted_at, accepted_ip, immediate_consent, payer_hint, claimed_at, COALESCE(user_id, 0),
	created_at, paid_at, refunded_at`

type scanner interface{ Scan(dest ...any) error }

func scanOrder(sc scanner, o *Order) error {
	return sc.Scan(&o.ID, &o.Email, &o.Name, &o.Product, &o.Code, &o.Language, &o.Days, &o.Amount, &o.Currency, &o.Status,
		&o.Provider, &o.ProviderRef, &o.OfferVersion, &o.AcceptedAt, &o.AcceptedIP, &o.ImmediateConsent, &o.PayerHint,
		&o.ClaimedAt, &o.UserID, &o.CreatedAt, &o.PaidAt, &o.RefundedAt)
}

func nowStr(t time.Time) string { return t.UTC().Format(time.RFC3339) }

// CreateOrder сохраняет новый заказ (статус pending).
func (s *Store) CreateOrder(ctx context.Context, o *Order) error {
	if o.Status == "" {
		o.Status = StatusPending
	}
	if o.Currency == "" {
		o.Currency = "KZT"
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO orders(id, email, name, product, code, language, days, amount, currency, status,
		provider, provider_ref, offer_version, accepted_at, accepted_ip, immediate_consent, created_at)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
		o.ID, o.Email, o.Name, o.Product, o.Code, o.Language, o.Days, o.Amount, o.Currency, o.Status,
		o.Provider, o.ProviderRef, o.OfferVersion, o.AcceptedAt, o.AcceptedIP, o.ImmediateConsent, o.CreatedAt)
	return err
}

func (s *Store) GetOrder(ctx context.Context, id string) (*Order, error) {
	o := &Order{}
	err := scanOrder(s.db.QueryRowContext(ctx, `SELECT `+orderCols+` FROM orders WHERE id = $1`, id), o)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return o, err
}

// ListOrders — последние заказы (status пусто = любые).
func (s *Store) ListOrders(ctx context.Context, status string, limit int) ([]Order, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+orderCols+` FROM orders WHERE ($1 = '' OR status = $1) ORDER BY created_at DESC, id LIMIT $2`, status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Order{}
	for rows.Next() {
		var o Order
		if err := scanOrder(rows, &o); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func (s *Store) SetProviderRef(ctx context.Context, id, ref string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE orders SET provider_ref = $2 WHERE id = $1`, id, ref)
	return err
}

// MarkOrderFailed переводит незавершённый заказ в failed (оплаченный и возвращённый не трогает).
func (s *Store) MarkOrderFailed(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE orders SET status = 'failed' WHERE id = $1 AND status IN ('pending','claimed')`, id)
	return err
}

// ClaimOrder — покупатель сообщает «я оплатил» (pending → claimed). Это не подтверждение оплаты:
// выдачу доступа запускает только проверенный платёж. Подсказка плательщика помогает найти платёж в выписке.
func (s *Store) ClaimOrder(ctx context.Context, id, payerHint string, now time.Time) error {
	res, err := s.db.ExecContext(ctx, `UPDATE orders SET status = 'claimed', payer_hint = $2,
		claimed_at = CASE WHEN claimed_at = '' THEN $3 ELSE claimed_at END WHERE id = $1 AND status IN ('pending','claimed')`,
		id, payerHint, nowStr(now))
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		if _, gerr := s.GetOrder(ctx, id); gerr != nil {
			return gerr
		}
		return ErrOrderState
	}
	return nil
}

/* ---------- Выдача доступа ---------- */

// FulfillInput — подтверждённый платёж. Amount/Currency сверяются с заказом: расхождение доступ не выдаёт.
type FulfillInput struct {
	OrderID, Provider, EventID, ProviderRef string
	Amount                                  int64
	Currency                                string
	Payload                                 string // сырое событие (для аудита)
	PasswordHash                            string // хеш случайного пароля для НОВОГО пользователя
	Now                                     time.Time
	// Mail собирает письмо покупателю внутри транзакции (вместе с выдачей доступа); nil — без письма.
	Mail func(o *Order, r *FulfillResult) (subject, body string)
}

type FulfillResult struct {
	Order       Order
	UserID      int64
	NewUser     bool
	AccessUntil string // YYYY-MM-DD; пусто — бессрочно
	SetupToken  string // только у нового пользователя; в БД лежит лишь хеш
	Duplicate   bool   // это событие или заказ уже обработаны: ничего не изменено
	Mismatch    bool   // сумма или валюта не совпали: доступ не выдан
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// extendExpiry возвращает новый срок доступа: от текущего конца (если доступ ещё действует) либо от сегодня.
// exists=false — доступа не было. Бессрочный доступ (пустой срок) остаётся бессрочным.
func extendExpiry(exists bool, current string, days int, now time.Time) string {
	if exists && current == "" {
		return ""
	}
	today := now.UTC().Format("2006-01-02")
	base := now.UTC()
	if exists && current >= today {
		if t, err := time.Parse("2006-01-02", current); err == nil {
			base = t
		}
	}
	return base.AddDate(0, 0, days).Format("2006-01-02")
}

func recordEvent(ctx context.Context, tx *sql.Tx, provider, eventID, orderID, kind, note, payload string, now time.Time) (inserted bool, err error) {
	res, err := tx.ExecContext(ctx, `INSERT INTO payment_events(provider, event_id, order_id, kind, note, payload, received_at)
		VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (provider, event_id) DO NOTHING`,
		provider, eventID, orderID, kind, note, payload, nowStr(now))
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

func createSetupTokenTx(ctx context.Context, tx *sql.Tx, userID int64, now time.Time) (string, error) {
	raw, err := newToken()
	if err != nil {
		return "", err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO password_setups(token_hash, user_id, expires_at, created_at) VALUES($1,$2,$3,$4)`,
		hashToken(raw), userID, nowStr(now.Add(SetupTokenTTL)), nowStr(now))
	return raw, err
}

func enqueueEmailTx(ctx context.Context, tx *sql.Tx, to, subject, body, kind string, now time.Time) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO email_outbox(to_email, subject, body, kind, created_at) VALUES($1,$2,$3,$4,$5)`,
		to, subject, body, kind, nowStr(now))
	return err
}

// FulfillOrder выдаёт доступ по подтверждённой оплате: событие записывается один раз, заказ блокируется,
// сумма сверяется, пользователь находится по email или создаётся, доступ продлевается, письмо ставится в очередь.
// Повторная доставка того же события или повторная оплата уже выполненного заказа ничего не меняет (Duplicate).
func (s *Store) FulfillOrder(ctx context.Context, in FulfillInput) (*FulfillResult, error) {
	res := &FulfillResult{}
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		fresh, err := recordEvent(ctx, tx, in.Provider, in.EventID, in.OrderID, "paid", "", in.Payload, in.Now)
		if err != nil {
			return err
		}
		if !fresh {
			res.Duplicate = true
			return nil
		}
		var o Order
		if err := scanOrder(tx.QueryRowContext(ctx, `SELECT `+orderCols+` FROM orders WHERE id = $1 FOR UPDATE`, in.OrderID), &o); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		res.Order = o
		switch o.Status {
		case StatusPaid:
			res.Duplicate = true
			return nil
		case StatusRefunded:
			return ErrOrderState
		}
		if in.Amount != o.Amount || !strings.EqualFold(in.Currency, o.Currency) {
			res.Mismatch = true
			_, err := tx.ExecContext(ctx, `UPDATE payment_events SET note = $3 WHERE provider = $1 AND event_id = $2`,
				in.Provider, in.EventID, "amount_mismatch")
			return err // событие сохранено, доступ не выдан
		}

		var uid int64
		err = tx.QueryRowContext(ctx, `SELECT id FROM users WHERE email = $1`, o.Email).Scan(&uid)
		switch {
		case errors.Is(err, sql.ErrNoRows):
			name := o.Name
			if name == "" {
				name = o.Email
			}
			if err := tx.QueryRowContext(ctx, `INSERT INTO users(name, email, password_hash, full_name, created_at)
				VALUES($1,$2,$3,$4,$5) RETURNING id`, name, o.Email, in.PasswordHash, name, nowStr(in.Now)).Scan(&uid); err != nil {
				return err
			}
			res.NewUser = true
		case err != nil:
			return err
		}

		var cur string
		exists := true
		if err := tx.QueryRowContext(ctx, `SELECT expires_at FROM test_access WHERE user_id = $1 AND code = $2 AND language = $3`,
			uid, o.Code, o.Language).Scan(&cur); err != nil {
			if !errors.Is(err, sql.ErrNoRows) {
				return err
			}
			exists = false
		}
		res.AccessUntil = extendExpiry(exists, cur, o.Days, in.Now)
		if _, err := tx.ExecContext(ctx, `INSERT INTO test_access(user_id, code, language, granted_at, expires_at) VALUES($1,$2,$3,$4,$5)
			ON CONFLICT (user_id, code, language) DO UPDATE SET expires_at = EXCLUDED.expires_at, granted_at = EXCLUDED.granted_at`,
			uid, o.Code, o.Language, nowStr(in.Now), res.AccessUntil); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE orders SET status = 'paid', paid_at = $2, user_id = $3,
			provider_ref = CASE WHEN $4 <> '' THEN $4 ELSE provider_ref END WHERE id = $1`,
			o.ID, nowStr(in.Now), uid, in.ProviderRef); err != nil {
			return err
		}
		o.Status, o.PaidAt, o.UserID = StatusPaid, nowStr(in.Now), uid
		res.Order, res.UserID = o, uid
		if res.NewUser {
			if res.SetupToken, err = createSetupTokenTx(ctx, tx, uid, in.Now); err != nil {
				return err
			}
		}
		if in.Mail != nil {
			subj, body := in.Mail(&o, res)
			if err := enqueueEmailTx(ctx, tx, o.Email, subj, body, "access", in.Now); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return res, nil
}

type RefundResult struct {
	Order       Order
	AccessUntil string // новый срок; пусто и Revoked=true — доступ снят
	Revoked     bool
	Duplicate   bool
}

// RefundOrder оформляет возврат оплаченного заказа: статус refunded, срок доступа уменьшается на купленные дни
// (если после этого доступа не остаётся, он снимается). Бессрочный доступ не меняется.
func (s *Store) RefundOrder(ctx context.Context, orderID, provider, eventID, payload string, now time.Time) (*RefundResult, error) {
	res := &RefundResult{}
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		fresh, err := recordEvent(ctx, tx, provider, eventID, orderID, "refunded", "", payload, now)
		if err != nil {
			return err
		}
		if !fresh {
			res.Duplicate = true
			return nil
		}
		var o Order
		if err := scanOrder(tx.QueryRowContext(ctx, `SELECT `+orderCols+` FROM orders WHERE id = $1 FOR UPDATE`, orderID), &o); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		res.Order = o
		if o.Status == StatusRefunded {
			res.Duplicate = true
			return nil
		}
		if o.Status != StatusPaid {
			return ErrOrderState
		}
		var cur string
		err = tx.QueryRowContext(ctx, `SELECT expires_at FROM test_access WHERE user_id = $1 AND code = $2 AND language = $3`,
			o.UserID, o.Code, o.Language).Scan(&cur)
		switch {
		case errors.Is(err, sql.ErrNoRows): // доступ уже снят вручную
			res.Revoked = true
		case err != nil:
			return err
		case cur == "": // бессрочный
			res.AccessUntil = ""
		default:
			t, perr := time.Parse("2006-01-02", cur)
			if perr != nil {
				return perr
			}
			left := t.AddDate(0, 0, -o.Days)
			if left.Format("2006-01-02") <= now.UTC().Format("2006-01-02") { // срок возврата уже не оставляет дней
				if _, err := tx.ExecContext(ctx, `DELETE FROM test_access WHERE user_id = $1 AND code = $2 AND language = $3`, o.UserID, o.Code, o.Language); err != nil {
					return err
				}
				res.Revoked = true
			} else {
				res.AccessUntil = left.Format("2006-01-02")
				if _, err := tx.ExecContext(ctx, `UPDATE test_access SET expires_at = $4 WHERE user_id = $1 AND code = $2 AND language = $3`,
					o.UserID, o.Code, o.Language, res.AccessUntil); err != nil {
					return err
				}
			}
		}
		_, err = tx.ExecContext(ctx, `UPDATE orders SET status = 'refunded', refunded_at = $2 WHERE id = $1`, o.ID, nowStr(now))
		o.Status, o.RefundedAt = StatusRefunded, nowStr(now)
		res.Order = o
		return err
	})
	if err != nil {
		return nil, err
	}
	return res, nil
}

/* ---------- Ссылки «задайте пароль» ---------- */

// CreateSetupToken выпускает новую ссылку для существующего пользователя (повторная отправка).
func (s *Store) CreateSetupToken(ctx context.Context, userID int64, now time.Time) (string, error) {
	var raw string
	err := s.inTx(ctx, func(tx *sql.Tx) (err error) {
		raw, err = createSetupTokenTx(ctx, tx, userID, now)
		return
	})
	return raw, err
}

// ConsumeSetupToken задаёт пароль по одноразовой ссылке. Неверная, использованная или просроченная — ErrBadToken.
func (s *Store) ConsumeSetupToken(ctx context.Context, raw, passwordHash string, now time.Time) (int64, error) {
	var uid int64
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		var expires, used string
		err := tx.QueryRowContext(ctx, `SELECT user_id, expires_at, used_at FROM password_setups WHERE token_hash = $1 FOR UPDATE`, hashToken(raw)).Scan(&uid, &expires, &used)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrBadToken
		}
		if err != nil {
			return err
		}
		if used != "" || expires < nowStr(now) {
			return ErrBadToken
		}
		if _, err := tx.ExecContext(ctx, `UPDATE users SET password_hash = $2, failed_attempts = 0, locked_until = '' WHERE id = $1`, uid, passwordHash); err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `UPDATE password_setups SET used_at = $2 WHERE token_hash = $1`, hashToken(raw), nowStr(now))
		return err
	})
	return uid, err
}

/* ---------- Очередь писем ---------- */

type Email struct {
	ID        int64  `json:"id"`
	To        string `json:"to"`
	Subject   string `json:"subject"`
	Body      string `json:"body"`
	Kind      string `json:"kind"`
	CreatedAt string `json:"created_at"`
	SentAt    string `json:"sent_at"`
	Attempts  int    `json:"attempts"`
	LastError string `json:"last_error"`
}

// MaxEmailAttempts — после стольких неудач письмо перестаёт отправляться само (остаётся видно в админке).
const MaxEmailAttempts = 8

func (s *Store) EnqueueEmail(ctx context.Context, to, subject, body, kind string, now time.Time) error {
	return s.inTx(ctx, func(tx *sql.Tx) error { return enqueueEmailTx(ctx, tx, to, subject, body, kind, now) })
}

func (s *Store) scanEmails(rows *sql.Rows) ([]Email, error) {
	defer rows.Close()
	out := []Email{}
	for rows.Next() {
		var e Email
		if err := rows.Scan(&e.ID, &e.To, &e.Subject, &e.Body, &e.Kind, &e.CreatedAt, &e.SentAt, &e.Attempts, &e.LastError); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

const emailCols = `id, to_email, subject, body, kind, created_at, sent_at, attempts, last_error`

func (s *Store) PendingEmails(ctx context.Context, limit int) ([]Email, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+emailCols+` FROM email_outbox WHERE sent_at = '' AND attempts < $1 ORDER BY id LIMIT $2`, MaxEmailAttempts, limit)
	if err != nil {
		return nil, err
	}
	return s.scanEmails(rows)
}

func (s *Store) ListEmails(ctx context.Context, limit int) ([]Email, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+emailCols+` FROM email_outbox ORDER BY id DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	return s.scanEmails(rows)
}

func (s *Store) MarkEmailSent(ctx context.Context, id int64, now time.Time) error {
	_, err := s.db.ExecContext(ctx, `UPDATE email_outbox SET sent_at = $2, attempts = attempts + 1, last_error = '' WHERE id = $1`, id, nowStr(now))
	return err
}

func (s *Store) MarkEmailFailed(ctx context.Context, id int64, msg string) error {
	if len(msg) > 300 {
		msg = msg[:300]
	}
	_, err := s.db.ExecContext(ctx, `UPDATE email_outbox SET attempts = attempts + 1, last_error = $2 WHERE id = $1`, id, msg)
	return err
}

// PurgeOldEmails удаляет отправленные и безнадёжные письма старше срока: в телах лежат ссылки для пароля.
func (s *Store) PurgeOldEmails(ctx context.Context, olderThan time.Duration, now time.Time) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM email_outbox WHERE created_at < $1`, nowStr(now.Add(-olderThan)))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
