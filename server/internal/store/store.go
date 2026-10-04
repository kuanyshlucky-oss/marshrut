// Package store — единственное место, где приложение говорит с PostgreSQL.
// Все методы принимают context запроса: отмена клиента или таймаут сервера
// прерывают запрос к БД, а не оставляют его висеть на занятом соединении.
package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib" // драйвер pgx для database/sql
)

var (
	ErrNotFound         = errors.New("не найдено")
	ErrEmailTaken       = errors.New("логин уже занят")
	ErrTooManyFavorites = errors.New("слишком много избранных")
	ErrTooManyResults   = errors.New("слишком много результатов")
)

// Лимиты на пользователя: защита от раздувания таблиц одним аккаунтом.
const (
	MaxFavorites      = 200
	MaxResultsPerUser = 5000
)

type Store struct {
	db *sql.DB
}

// Open открывает пул соединений и проверяет, что БД отвечает.
func Open(ctx context.Context, dsn string, maxConns int) (*Store, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	// Neon free ограничивает число соединений — держим небольшой пул.
	db.SetMaxOpenConns(maxConns)
	db.SetMaxIdleConns(maxConns)
	db.SetConnMaxIdleTime(30 * time.Second)
	db.SetConnMaxLifetime(30 * time.Minute)
	pingCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// Ping — проверка готовности (для /api/ready).
func (s *Store) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }

// DB отдаёт пул — нужен только тестам и миграциям.
func (s *Store) DB() *sql.DB { return s.db }

// inTx выполняет fn в транзакции: либо все изменения, либо ни одного.
func (s *Store) inTx(ctx context.Context, fn func(tx *sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
