module marshrut-api

go 1.26.0

// Фиксируем патч-версию тулчейна: до go1.26.6 в стандартной библиотеке были
// уязвимости в net/http, crypto/tls, encoding/asn1 и encoding/xml (govulncheck).
// `go build`/`go test` сами скачают эту версию, если текущая ниже
// (GOTOOLCHAIN=auto по умолчанию) — не зависит от того, какой go зашит в
// базовый Docker-образ. При выходе новых патчей проверяйте `govulncheck ./...`.
toolchain go1.26.6

require (
	github.com/fergusstrange/embedded-postgres v1.34.0
	github.com/jackc/pgx/v5 v5.10.0
	golang.org/x/crypto v0.56.0
)

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/lib/pq v1.10.9 // indirect
	github.com/xi2/xz v0.0.0-20171230120015-48954b6210f8 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/text v0.41.0 // indirect
)
