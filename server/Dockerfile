# --- Сборка ---
FROM golang:1.26-alpine AS build
WORKDIR /src

# сначала манифесты зависимостей (кэш слоёв), затем исходники
COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal
# -trimpath и -s -w: воспроизводимая сборка и бинарник без отладочных символов
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/api

# --- Рантайм ---
FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /out/server /app/server

# не запускаем от root: при взломе процесса доступ к контейнеру ограничен
RUN adduser -D -H app
USER app

ENV PORT=8080
# сколько прокси перед сервером дописывает X-Forwarded-For (Render — один)
ENV TRUSTED_PROXY_HOPS=1
# DATABASE_URL (строка подключения к Postgres) задаётся в окружении хостинга

EXPOSE 8080
# проба живости: процесс отвечает (готовность с проверкой БД — /api/ready)
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
CMD ["/app/server"]
