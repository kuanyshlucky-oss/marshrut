//go:build integration

// Package testdb поднимает настоящий PostgreSQL (embedded-postgres) для
// интеграционных тестов. Запуск: go test -tags integration ./...
// Первый запуск скачивает бинарники Postgres (~50 МБ, кэшируются).
package testdb

import (
	"database/sql"
	"fmt"
	"io"
	"net"
	"os"
	"sync/atomic"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	_ "github.com/jackc/pgx/v5/stdlib"
)

// Server — запущенный экземпляр Postgres; на каждый тест выдаёт чистую БД.
type Server struct {
	pg   *embeddedpostgres.EmbeddedPostgres
	port int
	dir  string
	n    atomic.Int64
}

func Start() (*Server, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	port := l.Addr().(*net.TCPAddr).Port
	l.Close()

	dir, err := os.MkdirTemp("", "marshrut-pg-*")
	if err != nil {
		return nil, err
	}
	pg := embeddedpostgres.NewDatabase(embeddedpostgres.DefaultConfig().
		Port(uint32(port)).
		RuntimePath(dir).DataPath(dir + "/data").
		Version(embeddedpostgres.V16).
		Logger(io.Discard))
	if err := pg.Start(); err != nil {
		os.RemoveAll(dir)
		return nil, fmt.Errorf("запуск embedded postgres: %w", err)
	}
	return &Server{pg: pg, port: port, dir: dir}, nil
}

func (s *Server) Stop() {
	_ = s.pg.Stop()
	_ = os.RemoveAll(s.dir)
}

func (s *Server) dsn(db string) string {
	return fmt.Sprintf("postgres://postgres:postgres@127.0.0.1:%d/%s?sslmode=disable", s.port, db)
}

// NewDB создаёт пустую базу и возвращает строку подключения к ней.
func (s *Server) NewDB() (string, error) {
	admin, err := sql.Open("pgx", s.dsn("postgres"))
	if err != nil {
		return "", err
	}
	defer admin.Close()
	name := fmt.Sprintf("t%d", s.n.Add(1))
	if _, err := admin.Exec("CREATE DATABASE " + name); err != nil {
		return "", err
	}
	return s.dsn(name), nil
}
