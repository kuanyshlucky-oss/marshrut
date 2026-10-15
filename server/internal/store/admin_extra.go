package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Дополнительные функции админки: заметки, блокировка, срок доступа,
// баннер, пометки вопросов.

const activeAccess = `(expires_at = '' OR expires_at >= to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'))`

func (s *Store) SetNote(ctx context.Context, id int64, note string) error {
	return s.updateUserField(ctx, `UPDATE users SET note = $2 WHERE id = $1`, id, note)
}

func (s *Store) SetBlocked(ctx context.Context, id int64, blocked bool) error {
	return s.updateUserField(ctx, `UPDATE users SET blocked = $2 WHERE id = $1`, id, blocked)
}

func (s *Store) updateUserField(ctx context.Context, q string, id int64, v any) error {
	res, err := s.db.ExecContext(ctx, q, id, v)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// IsBlocked — заблокирован ли аккаунт.
func (s *Store) IsBlocked(ctx context.Context, id int64) (bool, error) {
	var b bool
	err := s.db.QueryRowContext(ctx, `SELECT blocked FROM users WHERE id = $1`, id).Scan(&b)
	if errors.Is(err, sql.ErrNoRows) {
		return false, ErrNotFound
	}
	return b, err
}

// TouchLogin запоминает время последнего входа.
func (s *Store) TouchLogin(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `UPDATE users SET last_login_at = $2 WHERE id = $1`, id, time.Now().UTC().Format(time.RFC3339))
	return err
}

// GrantAccessUntil выдаёт (или продлевает) доступ; expires — YYYY-MM-DD или "" (бессрочно).
func (s *Store) GrantAccessUntil(ctx context.Context, userID int64, code, language, expires string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO test_access(user_id, code, language, granted_at, expires_at) VALUES($1, $2, $3, $4, $5)
		 ON CONFLICT (user_id, code, language) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
		userID, code, language, time.Now().UTC().Format(time.RFC3339), expires)
	return err
}

// TopicRow — статистика по теме одного пользователя.
type TopicRow struct {
	Code    string `json:"code"`
	Section string `json:"section"`
	Topic   string `json:"topic"`
	Correct int    `json:"correct"`
	Wrong   int    `json:"wrong"`
}

func (s *Store) UserTopics(ctx context.Context, uid int64) ([]TopicRow, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT code, section, topic, correct, wrong FROM topic_stats WHERE user_id = $1 ORDER BY code, section, topic`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TopicRow{}
	for rows.Next() {
		var t TopicRow
		if err := rows.Scan(&t.Code, &t.Section, &t.Topic, &t.Correct, &t.Wrong); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// SubmittedAttempts — сданные попытки (items + answers) для разбора сложных вопросов.
func (s *Store) SubmittedAttempts(ctx context.Context, limit int) ([]*Attempt, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+attemptCols+` FROM attempts WHERE submitted_at IS NOT NULL AND answers IS NOT NULL
		 ORDER BY submitted_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Attempt
	for rows.Next() {
		a, err := scanAttempt(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// Banner — сообщение для всех пользователей.
type Banner struct {
	Text      string `json:"text"`
	Kind      string `json:"kind"` // info | warn
	Active    bool   `json:"active"`
	UpdatedAt string `json:"updated_at"`
}

func (s *Store) GetBanner(ctx context.Context) (Banner, error) {
	b := Banner{Kind: "info"}
	err := s.db.QueryRowContext(ctx, `SELECT text, kind, active, updated_at FROM site_banner WHERE id = 1`).
		Scan(&b.Text, &b.Kind, &b.Active, &b.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return b, nil
	}
	return b, err
}

func (s *Store) SetBanner(ctx context.Context, b Banner) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO site_banner(id, text, kind, active, updated_at) VALUES(1, $1, $2, $3, $4)
		 ON CONFLICT (id) DO UPDATE SET text = $1, kind = $2, active = $3, updated_at = $4`,
		b.Text, b.Kind, b.Active, time.Now().UTC().Format(time.RFC3339))
	return err
}

// QuestionFlag — пометка вопроса «с ошибкой».
type QuestionFlag struct {
	ID        int64  `json:"id"`
	Bank      string `json:"bank"`
	Idx       int    `json:"idx"`
	Question  string `json:"question"`
	Note      string `json:"note"`
	Resolved  bool   `json:"resolved"`
	CreatedAt string `json:"created_at"`
}

func (s *Store) ListFlags(ctx context.Context) ([]QuestionFlag, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, bank, idx, question, note, resolved, created_at FROM question_flags ORDER BY resolved, id DESC LIMIT 500`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []QuestionFlag{}
	for rows.Next() {
		var f QuestionFlag
		if err := rows.Scan(&f.ID, &f.Bank, &f.Idx, &f.Question, &f.Note, &f.Resolved, &f.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (s *Store) AddFlag(ctx context.Context, bank string, idx int, question, note string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO question_flags(bank, idx, question, note, created_at) VALUES($1,$2,$3,$4,$5)
		 ON CONFLICT (bank, idx) WHERE NOT resolved DO UPDATE SET note = EXCLUDED.note`,
		bank, idx, question, note, time.Now().UTC().Format(time.RFC3339))
	return err
}

func (s *Store) ResolveFlag(ctx context.Context, id int64, resolved bool) error {
	return s.updateUserField(ctx, `UPDATE question_flags SET resolved = $2 WHERE id = $1`, id, resolved)
}
