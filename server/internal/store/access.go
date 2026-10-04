package store

import (
	"context"
	"time"
)

// Доступ к тестам выдаётся вручную администратором на код направления и язык
// (RU/KK) — булево «выдан/не выдан», без срока действия.

func (s *Store) GrantAccess(ctx context.Context, userID int64, code, language string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO test_access(user_id, code, language, granted_at) VALUES($1, $2, $3, $4)
		 ON CONFLICT (user_id, code, language) DO NOTHING`,
		userID, code, language, time.Now().UTC().Format(time.RFC3339),
	)
	return err
}

func (s *Store) RevokeAccess(ctx context.Context, userID int64, code, language string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM test_access WHERE user_id = $1 AND code = $2 AND language = $3`, userID, code, language)
	return err
}

func (s *Store) HasAccess(ctx context.Context, userID int64, code, language string) (bool, error) {
	var ok bool
	err := s.db.QueryRowContext(ctx,
		`SELECT EXISTS(SELECT 1 FROM test_access WHERE user_id = $1 AND code = $2 AND language = $3)`,
		userID, code, language).Scan(&ok)
	return ok, err
}
