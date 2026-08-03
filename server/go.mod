module marshrut-api

go 1.25.0

// Фиксируем патч-версию тулчейна: go1.26.4 содержит уязвимость в crypto/tls
// (GO-2026-5856, утечка приватности через Encrypted Client Hello), исправлено
// в go1.26.5. `go build`/`go test` автоматически скачают эту версию, если
// текущая ниже (GOTOOLCHAIN=auto по умолчанию) — не зависит от того, какой
// go зашит в базовый Docker-образ.
toolchain go1.26.5

// Зависимости (golang.org/x/crypto, modernc.org/sqlite) и go.sum
// подтягиваются командой `go mod tidy` — выполните её один раз локально
// или она отработает автоматически при сборке Docker-образа.

require (
	github.com/jackc/pgx/v5 v5.10.0
	golang.org/x/crypto v0.53.0
)

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/text v0.40.0 // indirect
)
