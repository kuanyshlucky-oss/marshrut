# --- Сборка ---
FROM golang:1.26-alpine AS build
WORKDIR /src

# сначала манифесты зависимостей (кэш слоёв), затем исходники
COPY go.mod go.sum ./
RUN go mod download

COPY *.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/server .

# --- Рантайм ---
FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /out/server /app/server

ENV PORT=8080
# на Render/Railway директорию data лучше примонтировать как диск/том (см. README)
ENV DB_PATH=/app/data/marshrut.db

EXPOSE 8080
CMD ["/app/server"]
