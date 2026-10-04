package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

var (
	ErrTooManyAttempts = errors.New("слишком много попыток за час")
	ErrAttemptExpired  = errors.New("время попытки истекло")
)

const (
	// MaxAttemptsPerHour — сколько попыток пользователь может начать за час.
	// Каждая сданная попытка раскрывает ключи своих вопросов, поэтому лимит
	// замедляет выгрузку банков (студенту хватает с запасом).
	MaxAttemptsPerHour = 40
	// AttemptRetention — сколько хранится сданная попытка для разбора в кабинете.
	AttemptRetention = 90 * 24 * time.Hour
)

// Attempt — попытка теста. Items и Answers — JSON (структуру знает пакет exam).
type Attempt struct {
	ID          string
	UserID      int64
	Kind        string
	Code        string
	Section     string
	Lang        string
	ContentLang string
	Title       string
	Items       []byte
	Answers     []byte // nil, пока попытка не сдана
	CreatedAt   time.Time
	ExpiresAt   time.Time
	SubmittedAt *time.Time
}

// CreateAttempt сохраняет новую попытку (не больше MaxAttemptsPerHour в час).
func (s *Store) CreateAttempt(ctx context.Context, a *Attempt) error {
	return s.inTx(ctx, func(tx *sql.Tx) error {
		var n int
		if err := tx.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM attempts WHERE user_id = $1 AND created_at > now() - interval '1 hour'`,
			a.UserID).Scan(&n); err != nil {
			return err
		}
		if n >= MaxAttemptsPerHour {
			return ErrTooManyAttempts
		}
		return tx.QueryRowContext(ctx,
			`INSERT INTO attempts(id, user_id, kind, code, section, lang, content_lang, title, items, expires_at)
			 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING created_at`,
			a.ID, a.UserID, a.Kind, a.Code, a.Section, a.Lang, a.ContentLang, a.Title, a.Items, a.ExpiresAt,
		).Scan(&a.CreatedAt)
	})
}

const attemptCols = `id, user_id, kind, code, section, lang, content_lang, title, items, answers, created_at, expires_at, submitted_at`

type rowScanner interface{ Scan(dest ...any) error }

func scanAttempt(r rowScanner) (*Attempt, error) {
	a := &Attempt{}
	if err := r.Scan(&a.ID, &a.UserID, &a.Kind, &a.Code, &a.Section, &a.Lang, &a.ContentLang, &a.Title,
		&a.Items, &a.Answers, &a.CreatedAt, &a.ExpiresAt, &a.SubmittedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return a, nil
}

// GetAttempt возвращает попытку только её владельцу (чужая — ErrNotFound).
func (s *Store) GetAttempt(ctx context.Context, id string, uid int64) (*Attempt, error) {
	return scanAttempt(s.db.QueryRowContext(ctx,
		`SELECT `+attemptCols+` FROM attempts WHERE id = $1 AND user_id = $2`, id, uid))
}

// Submission — итог проверки, который нужно записать вместе со сдачей.
type Submission struct {
	Code    string
	Kind    string // вид результата: subject | kt:nauchped | kt:profile
	Score   int
	Total   int
	Passed  bool
	Section string
	Hits    []TopicHit
}

// GradeFunc проверяет ответы попытки (чистая функция, без обращений к БД).
type GradeFunc func(a *Attempt) (*Submission, error)

// SubmitAttempt атомарно сдаёт попытку: блокирует строку, проверяет срок,
// проверяет ответы (grade), записывает результат и статистику по темам и
// помечает попытку сданной. Идемпотентно: повторная сдача уже сданной попытки
// ничего не пишет и возвращает сохранённую попытку с done = true — потерянный
// ответ сети не превращается в потерянный результат.
func (s *Store) SubmitAttempt(ctx context.Context, id string, uid int64, answers []byte, now time.Time, grade GradeFunc) (a *Attempt, done bool, err error) {
	err = s.inTx(ctx, func(tx *sql.Tx) error {
		cur, err := scanAttempt(tx.QueryRowContext(ctx,
			`SELECT `+attemptCols+` FROM attempts WHERE id = $1 AND user_id = $2 FOR UPDATE`, id, uid))
		if err != nil {
			return err
		}
		if cur.SubmittedAt != nil {
			a, done = cur, true
			return nil
		}
		if now.After(cur.ExpiresAt) {
			return ErrAttemptExpired
		}
		cur.Answers = answers
		sub, err := grade(cur)
		if err != nil {
			return err
		}
		if err := addResultTx(ctx, tx, uid, sub.Code, sub.Score, sub.Total, sub.Kind, sub.Passed, sub.Section, cur.ID, sub.Hits); err != nil {
			return err
		}
		if err := tx.QueryRowContext(ctx,
			`UPDATE attempts SET answers = $1, submitted_at = now() WHERE id = $2 RETURNING submitted_at`,
			answers, cur.ID).Scan(&cur.SubmittedAt); err != nil {
			return err
		}
		a = cur
		return nil
	})
	return a, done, err
}

// PurgeAttemptsData удаляет брошенные попытки (истекли давно) и сданные старше
// срока хранения; результаты в кабинете остаются, пропадает только разбор ответов.
func (s *Store) PurgeAttemptsData(ctx context.Context) (int64, error) {
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM attempts
		 WHERE (submitted_at IS NULL AND expires_at < now() - interval '1 day')
		    OR created_at < now() - make_interval(secs => $1::float8)`, AttemptRetention.Seconds())
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
