package store

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"log/slog"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Версионные миграции — SQL-файлы в migrations/ вида NNNN_описание.sql.
//
// Правила:
//   - новое изменение схемы = новый файл со следующим номером; выпущенные файлы
//     НИКОГДА не правятся;
//   - 0001_baseline.sql — схема, существовавшая до появления миграций;
//     полностью идемпотентна, поэтому безопасно применяется и к боевой БД;
//   - каждая миграция выполняется один раз в транзакции; pg_advisory_xact_lock
//     не даёт двум инстансам (при деплое старый и новый живут одновременно)
//     применять их параллельно.
//
//go:embed migrations/*.sql
var migrationsFS embed.FS

const migrationLockID = 7301001

var migrationName = regexp.MustCompile(`^(\d{4})_[a-z0-9_]+\.sql$`)

type migration struct {
	version int
	name    string
	sql     string
}

func loadMigrations(fsys embed.FS) ([]migration, error) {
	entries, err := fsys.ReadDir("migrations")
	if err != nil {
		return nil, err
	}
	var out []migration
	for _, e := range entries {
		m := migrationName.FindStringSubmatch(e.Name())
		if m == nil {
			return nil, fmt.Errorf("имя файла миграции %q не соответствует NNNN_name.sql", e.Name())
		}
		v, _ := strconv.Atoi(m[1])
		body, err := fsys.ReadFile("migrations/" + e.Name())
		if err != nil {
			return nil, err
		}
		out = append(out, migration{version: v, name: strings.TrimSuffix(e.Name(), ".sql"), sql: string(body)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].version < out[j].version })
	for i, m := range out {
		if m.version != i+1 {
			return nil, fmt.Errorf("миграции должны идти подряд без пропусков: ожидалась %04d, найдена %04d", i+1, m.version)
		}
	}
	return out, nil
}

// Migrate применяет все ещё не применённые миграции.
func (s *Store) Migrate(ctx context.Context) error {
	migs, err := loadMigrations(migrationsFS)
	if err != nil {
		return err
	}
	return s.inTx(ctx, func(tx *sql.Tx) error {
		// Блокировка берётся ДО создания schema_migrations: два инстанса, стартующих одновременно,
		// иначе гонятся уже на CREATE TABLE.
		if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock($1)`, migrationLockID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
			version    INT PRIMARY KEY,
			name       TEXT NOT NULL,
			applied_at TEXT NOT NULL
		)`); err != nil {
			return err
		}
		for _, m := range migs {
			var n int
			if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE version = $1`, m.version).Scan(&n); err != nil {
				return err
			}
			if n > 0 {
				continue
			}
			if _, err := tx.ExecContext(ctx, m.sql); err != nil {
				return fmt.Errorf("миграция %s: %w", m.name, err)
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations(version, name, applied_at) VALUES($1, $2, $3)`,
				m.version, m.name, time.Now().UTC().Format(time.RFC3339)); err != nil {
				return err
			}
			slog.Info("применена миграция", "name", m.name)
		}
		return nil
	})
}
