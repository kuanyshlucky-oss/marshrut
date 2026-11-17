package store

import (
	"context"
	"encoding/json"
)

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

// ListeningProgress — сводка по всем клипам пользователя.
func (s *Store) ListeningProgress(ctx context.Context, uid int64) (map[string]ListeningClip, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT a.clip_id, MAX(a.score), COUNT(*),
		       (SELECT l.score FROM listening_attempts l
		         WHERE l.user_id = a.user_id AND l.clip_id = a.clip_id
		         ORDER BY l.created_at DESC, l.id DESC LIMIT 1)
		  FROM listening_attempts a
		 WHERE a.user_id = $1
		 GROUP BY a.user_id, a.clip_id`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]ListeningClip{}
	for rows.Next() {
		var id string
		var c ListeningClip
		if err := rows.Scan(&id, &c.Best, &c.Tries, &c.Last); err != nil {
			return nil, err
		}
		out[id] = c
	}
	return out, rows.Err()
}

// SaveListeningResult записывает одно прохождение клипа: общий результат (%) и результат по каждой фразе.
func (s *Store) SaveListeningResult(ctx context.Context, uid int64, clipID string, score int, phrases []int) error {
	if phrases == nil {
		phrases = []int{}
	}
	raw, err := json.Marshal(phrases)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO listening_attempts (user_id, clip_id, score, phrases) VALUES ($1, $2, $3, $4::jsonb)`,
		uid, clipID, score, string(raw))
	return err
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
