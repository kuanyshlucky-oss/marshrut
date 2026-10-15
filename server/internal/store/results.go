package store

import (
	"context"
	"database/sql"
	"sort"
	"time"
)

// addResultTx сохраняет результат теста (не больше MaxResultsPerUser на
// пользователя) и обновляет статистику по темам — в переданной транзакции,
// чтобы результат, статистика и сдача попытки не расходились.
func addResultTx(ctx context.Context, tx *sql.Tx, uid int64, code string, score, total int, kind string, passed bool, section, attemptID string, hits []TopicHit) error {
	res, err := tx.ExecContext(ctx,
		`INSERT INTO results(user_id, code, score, total, date, kind, passed, section, attempt_id)
		 SELECT $1::bigint, $2::text, $3::int, $4::int, $5::text, $6::text, $7::boolean, $8::text, $9::text
		 WHERE (SELECT COUNT(*) FROM results WHERE user_id = $1::bigint) < $10::int`,
		uid, code, score, total, time.Now().UTC().Format("2006-01-02"), kind, passed, section, attemptID, MaxResultsPerUser,
	)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrTooManyResults
	}
	return addTopicStats(ctx, tx, uid, code, hits)
}

// addTopicStats агрегирует верные/неверные ответы попытки по темам. Раздел берётся
// из каждого hit отдельно: одна попытка (симуляция КТ) смешивает блоки
// lang/logic/subj1/subj2, и тема одного блока не должна попасть в другой.
// Сначала суммируем в Go, потом один upsert на пару (раздел, тема).
func addTopicStats(ctx context.Context, tx *sql.Tx, uid int64, code string, hits []TopicHit) error {
	type key struct{ section, topic string }
	type acc struct{ correct, wrong int }
	byKey := map[key]*acc{}
	for _, h := range hits {
		if h.Topic == "" || h.Section == "" {
			continue
		}
		k := key{h.Section, h.Topic}
		a := byKey[k]
		if a == nil {
			a = &acc{}
			byKey[k] = a
		}
		if h.Correct {
			a.correct++
		} else {
			a.wrong++
		}
	}
	// фиксированный порядок вставки — параллельные попытки одного пользователя не взаимоблокируются
	keys := make([]key, 0, len(byKey))
	for k := range byKey {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].section != keys[j].section {
			return keys[i].section < keys[j].section
		}
		return keys[i].topic < keys[j].topic
	})
	for _, k := range keys {
		a := byKey[k]
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO topic_stats(user_id, code, section, topic, correct, wrong)
			 VALUES($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (user_id, code, section, topic)
			 DO UPDATE SET correct = topic_stats.correct + EXCLUDED.correct,
			               wrong   = topic_stats.wrong   + EXCLUDED.wrong`,
			uid, code, k.section, k.topic, a.correct, a.wrong,
		); err != nil {
			return err
		}
	}
	return nil
}

// AdminResult — строка результата для админ-статистики (с данными пользователя).
type AdminResult struct {
	ID      int64  `json:"id"`
	UserID  int64  `json:"user_id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Code    string `json:"code"`
	Kind    string `json:"kind"`
	Section string `json:"section"`
	Score   int    `json:"score"`
	Total   int    `json:"total"`
	Passed  bool   `json:"passed"`
	Date    string `json:"date"`
}

// ListAllResults — последние результаты всех пользователей (новые первыми).
func (s *Store) ListAllResults(ctx context.Context, limit int) ([]AdminResult, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT r.id, r.user_id, u.email, u.name, r.code, r.kind, r.section, r.score, r.total, r.passed, r.date
		FROM results r JOIN users u ON u.id = r.user_id
		ORDER BY r.id DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminResult{}
	for rows.Next() {
		var r AdminResult
		if err := rows.Scan(&r.ID, &r.UserID, &r.Email, &r.Name, &r.Code, &r.Kind, &r.Section, &r.Score, &r.Total, &r.Passed, &r.Date); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
