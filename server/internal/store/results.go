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
