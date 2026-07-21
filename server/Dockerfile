# --- Сборка ---
FROM golang:1.26-alpine AS build
WORKDIR /src

# сначала манифесты зависимостей (кэш слоёв), затем исходники
COPY go.mod go.sum ./
RUN go mod download

COPY *.go ./
COPY content ./content
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/server .

# --- Рантайм ---
FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /out/server /app/server

ENV PORT=8080
# DATABASE_URL (строка подключения к Postgres) задаётся в окружении хостинга

EXPOSE 8080
CMD ["/app/server"]
