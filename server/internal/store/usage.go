package store

import (
	"context"
	"time"
)

// Журнал начала использования платного доступа (таблица usage_first).
// «Начало использования» — первый открытый вопрос платной части: сервер фиксирует его
// в момент создания попытки, до отдачи вопросов клиенту.

// RecordUsage записывает начало попытки. first = true, если это первое использование
// данного доступа (строка создана); иначе увеличивается счётчик попыток и время последней.
func (s *Store) RecordUsage(ctx context.Context, userID int64, code, language, attemptID, kind, section, ip string) (first bool, err error) {
	now := time.Now().UTC().Format(time.RFC3339)
	err = s.db.QueryRowContext(ctx, `
		INSERT INTO usage_first(user_id, code, language, first_at, attempt_id, kind, section, ip, attempts, last_at)
		VALUES($1, $2, $3, $4, $5, $6, $7, $8, 1, $4)
		ON CONFLICT (user_id, code, language)
		DO UPDATE SET attempts = usage_first.attempts + 1, last_at = EXCLUDED.last_at
		RETURNING (xmax = 0)`,
		userID, code, language, now, attemptID, kind, section, ip,
	).Scan(&first)
	return first, err
}

// UsageItem — доступ пользователя вместе со сведениями об использовании (для админки).
// FirstAt пуст, если доступ ещё не использовался. HasAccess = false, если доступ уже
// отозван, а журнал остался (чтобы спор о возврате не терял доказательства).
type UsageItem struct {
	Code           string `json:"code"`
	Language       string `json:"language"`
	HasAccess      bool   `json:"has_access"`
	GrantedAt      string `json:"granted_at"`
	ExpiresAt      string `json:"expires_at"`
	FirstAt        string `json:"first_used_at"`
	LastAt         string `json:"last_used_at"`
	Attempts       int    `json:"attempts"`
	FirstKind      string `json:"first_kind"`
	FirstSection   string `json:"first_section"`
	FirstAttemptID string `json:"first_attempt_id"`
	FirstIP        string `json:"first_ip"`
}

// ListUsage возвращает доступы и журнал использования пользователя.
func (s *Store) ListUsage(ctx context.Context, userID int64) ([]UsageItem, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT COALESCE(a.code, u.code), COALESCE(a.language, u.language),
		       (a.user_id IS NOT NULL), COALESCE(a.granted_at, ''), COALESCE(a.expires_at, ''),
		       COALESCE(u.first_at, ''), COALESCE(u.last_at, ''), COALESCE(u.attempts, 0),
		       COALESCE(u.kind, ''), COALESCE(u.section, ''), COALESCE(u.attempt_id, ''), COALESCE(u.ip, '')
		FROM (SELECT * FROM test_access WHERE user_id = $1) a
		FULL OUTER JOIN (SELECT * FROM usage_first WHERE user_id = $1) u
		  ON a.code = u.code AND a.language = u.language
		ORDER BY 1, 2`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []UsageItem{}
	for rows.Next() {
		var it UsageItem
		if err := rows.Scan(&it.Code, &it.Language, &it.HasAccess, &it.GrantedAt, &it.ExpiresAt,
			&it.FirstAt, &it.LastAt, &it.Attempts, &it.FirstKind, &it.FirstSection, &it.FirstAttemptID, &it.FirstIP); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}
