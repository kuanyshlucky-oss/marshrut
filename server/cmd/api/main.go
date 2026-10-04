// JetisHub — API-сервер (Go + PostgreSQL).
// Только сборка зависимостей и запуск: вся логика — в internal/.
// Подробности — в README.md.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"marshrut-api/internal/config"
	"marshrut-api/internal/content"
	"marshrut-api/internal/httpapi"
	"marshrut-api/internal/store"
)

func main() {
	if err := run(); err != nil {
		slog.Error("сервер остановлен с ошибкой", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	var handler slog.Handler = slog.NewTextHandler(os.Stdout, nil)
	if cfg.LogJSON {
		handler = slog.NewJSONHandler(os.Stdout, nil)
	}
	log := slog.New(handler)
	slog.SetDefault(log)
	for _, w := range cfg.Warnings() {
		log.Warn("настройки", "warning", w)
	}

	// ctx живёт до SIGINT/SIGTERM (Render шлёт SIGTERM при деплое).
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	st, err := store.Open(ctx, cfg.DatabaseURL, cfg.DBMaxConns)
	if err != nil {
		return err
	}
	defer st.Close()
	if err := st.Migrate(ctx); err != nil {
		return err
	}
	if err := st.SeedReference(ctx); err != nil {
		return err
	}
	tests, err := content.Load()
	if err != nil {
		return err
	}

	api := httpapi.New(ctx, cfg, st, tests, log)
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           api.Handler(),
		ReadHeaderTimeout: 5 * time.Second, // защита от slowloris
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}

	errc := make(chan error, 1)
	go func() {
		log.Info("сервер запущен", "addr", srv.Addr, "tests", len(tests.Infos()))
		errc <- srv.ListenAndServe()
	}()

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
		log.Info("получен сигнал остановки, дозавершаем запросы")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	}
}
