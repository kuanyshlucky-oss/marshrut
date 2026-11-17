package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
)

const (
	// ListeningMaxClips — сколько разных клипов может быть в сводке одного пользователя.
	// Клипов в тренажёре десятки; лимит не даёт одному аккаунту забить таблицу выдуманными id.
	ListeningMaxClips = 300
	// ListeningKeepAttempts — сколько последних прохождений каждого клипа хранится в истории.
	// Лучший результат, последний и число попыток живут в listening_progress и не зависят от этого.
	ListeningKeepAttempts = 20
)

// ErrTooManyClips — у пользователя уже ListeningMaxClips разных клипов, новый добавить нельзя.
var ErrTooManyClips = errors.New("слишком много разных клипов")

// ListeningClip — прогресс пользователя по одному клипу Listening: лучший и последний результат (%) и число прохождений.
type ListeningClip struct {
	Best  int `json:"best"`
	Last  int `json:"last"`
	Tries int `json:"tries"`
}

// ListeningAttempt — одно прохождение клипа (для истории и разбора по фразам).
type ListeningAttempt struct {
	Clip      string `json:"clip"`
	Score     int    `json:"score"`
	Phrases   []int  `json:"phrases"`
	CreatedAt string `json:"createdAt"`
}

// ListeningProgress — сводка по всем клипам пользователя: чтение по первичному ключу, без агрегации по истории.
func (s *Store) ListeningProgress(ctx context.Context, uid int64) (map[string]ListeningClip, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT clip_id, best, last, tries FROM listening_progress WHERE user_id = $1`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]ListeningClip{}
	for rows.Next() {
		var id string
		var c ListeningClip
		if err := rows.Scan(&id, &c.Best, &c.Last, &c.Tries); err != nil {
			return nil, err
		}
		out[id] = c
	}
	return out, rows.Err()
}

// SaveListeningResult записывает одно прохождение клипа и обновляет сводку — в одной транзакции.
// attemptID (необязателен) делает запись идемпотентной: повторная отправка того же прохождения
// (сеть оборвалась после записи, двойной клик) возвращает dup=true и ничего не меняет.
func (s *Store) SaveListeningResult(ctx context.Context, uid int64, clipID, attemptID string, score int, phrases []int) (dup bool, err error) {
	if phrases == nil {
		phrases = []int{}
	}
	raw, err := json.Marshal(phrases)
	if err != nil {
		return false, err
	}
	var aid any // NULL, если id не передан
	if attemptID != "" {
		aid = attemptID
	}
	err = s.inTx(ctx, func(tx *sql.Tx) error {
		// Попытка. ON CONFLICT DO NOTHING + RETURNING: нет строки в ответе = такая уже была.
		var id int64
		err := tx.QueryRowContext(ctx, `
			INSERT INTO listening_attempts (user_id, clip_id, score, phrases, attempt_id)
			VALUES ($1, $2, $3, $4::jsonb, $5)
			ON CONFLICT (user_id, attempt_id) WHERE attempt_id IS NOT NULL DO NOTHING
			RETURNING id`, uid, clipID, score, string(raw), aid).Scan(&id)
		if errors.Is(err, sql.ErrNoRows) {
			dup = true
			return nil
		}
		if err != nil {
			return err
		}

		// Новый клип в сводке: проверяем потолок числа разных клипов.
		var exists bool
		if err := tx.QueryRowContext(ctx,
			`SELECT EXISTS (SELECT 1 FROM listening_progress WHERE user_id = $1 AND clip_id = $2)`, uid, clipID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			var n int
			if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM listening_progress WHERE user_id = $1`, uid).Scan(&n); err != nil {
				return err
			}
			if n >= ListeningMaxClips {
				return ErrTooManyClips
			}
		}

		if _, err := tx.ExecContext(ctx, `
			INSERT INTO listening_progress AS p (user_id, clip_id, best, last, tries)
			VALUES ($1, $2, $3, $3, 1)
			ON CONFLICT (user_id, clip_id) DO UPDATE
			   SET best = GREATEST(p.best, EXCLUDED.best), last = EXCLUDED.last, tries = p.tries + 1, updated_at = now()`,
			uid, clipID, score); err != nil {
			return err
		}

		// История не растёт бесконечно: оставляем последние ListeningKeepAttempts прохождений этого клипа.
		_, err = tx.ExecContext(ctx, `
			DELETE FROM listening_attempts
			 WHERE user_id = $1 AND clip_id = $2
			   AND id NOT IN (SELECT id FROM listening_attempts
			                   WHERE user_id = $1 AND clip_id = $2
			                   ORDER BY created_at DESC, id DESC LIMIT $3)`, uid, clipID, ListeningKeepAttempts)
		return err
	})
	return dup, err
}

// ListeningHistory — последние прохождения пользователя (по убыванию времени), не более limit.
func (s *Store) ListeningHistory(ctx context.Context, uid int64, limit int) ([]ListeningAttempt, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT clip_id, score, phrases, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		  FROM listening_attempts WHERE user_id = $1
		 ORDER BY created_at DESC, id DESC LIMIT $2`, uid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ListeningAttempt{}
	for rows.Next() {
		var a ListeningAttempt
		var raw []byte
		if err := rows.Scan(&a.Clip, &a.Score, &raw, &a.CreatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(raw, &a.Phrases); err != nil {
			a.Phrases = []int{}
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
