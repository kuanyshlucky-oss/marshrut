package store

import (
	"context"
	"time"
)

// Защита входа: счётчики неудачных попыток и блокировки хранятся в БД
// (таблица login_attempts, UNLOGGED). Так они переживают рестарт и работают
// одинаково на любом числе инстансов. Ключ — произвольная строка; политику
// (какие ключи и какие пороги) задаёт вызывающий код.

// IsLocked — есть ли среди ключей хотя бы один заблокированный сейчас.
func (s *Store) IsLocked(ctx context.Context, keys ...string) (bool, error) {
	var locked bool
	err := s.db.QueryRowContext(ctx,
		`SELECT EXISTS(SELECT 1 FROM login_attempts WHERE key = ANY($1) AND locked_until > now())`,
		keys).Scan(&locked)
	return locked, err
}

// RecordFailure учитывает неудачу по ключу: счётчик считается в окне window,
// при достижении max ключ блокируется на lockFor. Один атомарный запрос.
func (s *Store) RecordFailure(ctx context.Context, key string, max int, window, lockFor time.Duration) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO login_attempts(key, fails, window_start, locked_until)
		VALUES($1, 1, now(), CASE WHEN 1 >= $2::int THEN now() + make_interval(secs => $4::float8) END)
		ON CONFLICT (key) DO UPDATE SET
			fails = CASE WHEN login_attempts.window_start < now() - make_interval(secs => $3::float8)
			             THEN 1 ELSE login_attempts.fails + 1 END,
			window_start = CASE WHEN login_attempts.window_start < now() - make_interval(secs => $3::float8)
			                    THEN now() ELSE login_attempts.window_start END,
			locked_until = CASE
				WHEN (CASE WHEN login_attempts.window_start < now() - make_interval(secs => $3::float8)
				           THEN 1 ELSE login_attempts.fails + 1 END) >= $2::int
				THEN now() + make_interval(secs => $4::float8)
				ELSE login_attempts.locked_until END`,
		key, max, window.Seconds(), lockFor.Seconds())
	return err
}

// ResetFailures сбрасывает счётчик ключа (успешный вход).
func (s *Store) ResetFailures(ctx context.Context, key string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM login_attempts WHERE key = $1`, key)
	return err
}

// PurgeAttempts удаляет устаревшие записи (не заблокированные и вне окна).
func (s *Store) PurgeAttempts(ctx context.Context, olderThan time.Duration) (int64, error) {
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM login_attempts
		 WHERE window_start < now() - make_interval(secs => $1::float8)
		   AND (locked_until IS NULL OR locked_until < now())`, olderThan.Seconds())
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
