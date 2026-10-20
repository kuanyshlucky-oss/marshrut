package store

import "context"

// PracticeUnit — прогресс пользователя по одному юниту практики.
type PracticeUnit struct {
	Best  int `json:"best"`
	Last  int `json:"last"`
	Tries int `json:"tries"`
}

func (s *Store) PracticeProgress(ctx context.Context, uid int64) (map[string]PracticeUnit, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT unit_id, best, last, tries FROM practice_progress WHERE user_id = $1`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]PracticeUnit{}
	for rows.Next() {
		var id string
		var u PracticeUnit
		if err := rows.Scan(&id, &u.Best, &u.Last, &u.Tries); err != nil {
			return nil, err
		}
		out[id] = u
	}
	return out, rows.Err()
}

// SavePracticeResult учитывает одну попытку: best только растёт, tries увеличивается.
func (s *Store) SavePracticeResult(ctx context.Context, uid int64, unitID string, right int) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO practice_progress (user_id, unit_id, best, last, tries) VALUES ($1, $2, $3, $3, 1)
		ON CONFLICT (user_id, unit_id) DO UPDATE SET
			best = GREATEST(practice_progress.best, EXCLUDED.best),
			last = EXCLUDED.last,
			tries = practice_progress.tries + 1`, uid, unitID, right)
	return err
}

// ImportPracticeProgress переносит локальный прогресс браузера: берёт максимум по best/tries.
func (s *Store) ImportPracticeProgress(ctx context.Context, uid int64, items map[string]PracticeUnit) error {
	for id, u := range items {
		if _, err := s.db.ExecContext(ctx, `
			INSERT INTO practice_progress (user_id, unit_id, best, last, tries) VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (user_id, unit_id) DO UPDATE SET
				best = GREATEST(practice_progress.best, EXCLUDED.best),
				tries = GREATEST(practice_progress.tries, EXCLUDED.tries)`, uid, id, u.Best, u.Last, u.Tries); err != nil {
			return err
		}
	}
	return nil
}
