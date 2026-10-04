// Package httpapi — HTTP-слой: маршруты, middleware и обработчики.
// Зависимости (хранилище, контент, подписчик токенов) приходят через Server,
// глобального состояния нет — поэтому слой целиком тестируется через httptest.
package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"marshrut-api/internal/auth"
	"marshrut-api/internal/config"
	"marshrut-api/internal/content"
	"marshrut-api/internal/store"
)

type Server struct {
	cfg      *config.Config
	store    *store.Store
	content  *content.Service
	signer   *auth.Signer
	sessions *auth.SessionCache
	log      *slog.Logger

	loginLimiter *rateLimiter // 5 попыток входа в минуту с одного IP
	adminLimiter *rateLimiter // запросы к /api/admin/* с одного IP
	adminFails   *rateLimiter // неверные админ-ключи с одного IP

	dummyHash string // хеш заведомо неверного пароля: выравнивает время ответа для несуществующих логинов
}

// New собирает сервер. Фоновые задачи (очистка лимитеров) живут до отмены ctx.
func New(ctx context.Context, cfg *config.Config, st *store.Store, ct *content.Service, log *slog.Logger) *Server {
	dummy, _ := auth.HashPassword("dummy-password-for-timing")
	s := &Server{
		cfg: cfg, store: st, content: ct, log: log,
		signer:       auth.NewSigner(cfg.JWTSecret),
		sessions:     auth.NewSessionCache(cfg.SessionCacheTTL, 10_000),
		loginLimiter: newRateLimiter(ctx, 5, time.Minute),
		adminLimiter: newRateLimiter(ctx, 20, time.Minute),
		adminFails:   newRateLimiter(ctx, maxAdminKeyFailures, 15*time.Minute),
		dummyHash:    dummy,
	}
	go s.purgeStale(ctx)
	return s
}

// purgeStale раз в час чистит устаревшие записи защиты входа и старые попытки тестов.
func (s *Server) purgeStale(ctx context.Context) {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			c, cancel := context.WithTimeout(ctx, 10*time.Second)
			if _, err := s.store.PurgeAttempts(c, 24*time.Hour); err != nil {
				s.log.Warn("не удалось очистить login_attempts", "err", err)
			}
			if _, err := s.store.PurgeAttemptsData(c); err != nil {
				s.log.Warn("не удалось очистить старые попытки тестов", "err", err)
			}
			cancel()
		}
	}
}

// Handler возвращает готовый http.Handler со всеми маршрутами и middleware.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/ready", s.handleReady)

	// Аккаунт
	mux.HandleFunc("POST /api/auth/register", s.handleRegister)
	mux.HandleFunc("POST /api/auth/login", s.rateLimit(s.loginLimiter, s.handleLogin))
	mux.HandleFunc("POST /api/auth/logout", s.auth(s.handleLogout))
	mux.HandleFunc("GET /api/me", s.auth(s.handleMe))
	mux.HandleFunc("PUT /api/profile", s.auth(s.handleUpdateProfile))
	mux.HandleFunc("PUT /api/profile/avatar", s.auth(s.handleSetAvatar))
	mux.HandleFunc("POST /api/favorites/toggle", s.auth(s.handleToggleFavorite))

	// Попытки тестов: вариант собирает и проверяет сервер, ключи — только после сдачи
	mux.HandleFunc("POST /api/attempts", s.auth(s.handleCreateAttempt))
	mux.HandleFunc("POST /api/attempts/{id}/submit", s.auth(s.handleSubmitAttempt))
	mux.HandleFunc("GET /api/attempts/{id}/review", s.auth(s.handleAttemptReview))

	// Админка
	mux.HandleFunc("GET /api/admin/users", s.admin(s.handleAdminUsers))
	mux.HandleFunc("POST /api/admin/create-user", s.admin(s.handleAdminCreate))
	mux.HandleFunc("POST /api/admin/delete-user", s.admin(s.handleAdminDelete))
	mux.HandleFunc("POST /api/admin/reset-password", s.admin(s.handleAdminResetPassword))
	mux.HandleFunc("POST /api/admin/reset-progress", s.admin(s.handleAdminResetProgress))
	mux.HandleFunc("GET /api/admin/test-codes", s.admin(s.handleAdminTestCodes))
	mux.HandleFunc("POST /api/admin/grant-access", s.admin(s.handleAdminGrantAccess))
	mux.HandleFunc("POST /api/admin/revoke-access", s.admin(s.handleAdminRevokeAccess))
	mux.HandleFunc("GET /api/admin/audit-log", s.admin(s.handleAdminAuditLog))

	// Конспекты (картинки страниц) — только по доступу к курсу
	mux.HandleFunc("GET /api/konspekt/{course}/{file}", s.auth(s.handleKonspektImage))

	// МагистрТрек
	mux.HandleFunc("GET /api/universities", s.handleUniversities)
	mux.HandleFunc("GET /api/specialities", s.handleSpecialities)
	mux.HandleFunc("GET /api/calculate-chances", s.auth(s.handleCalculate))
	mux.HandleFunc("GET /api/roadmap", s.auth(s.handleRoadmap))
	mux.HandleFunc("POST /api/roadmap/toggle", s.auth(s.handleRoadmapToggle))

	var h http.Handler = mux
	h = withGzip(h)
	h = s.withCORS(h)
	h = withSecurityHeaders(h)
	h = s.withAccessLog(h)
	h = s.withRecover(h)
	h = withRequestID(h)
	return h
}

// publicCache разрешает браузеру/CDN кэшировать публичный ответ (справочники меняются
// только при сиде). Вызывается только для успешных ответов — ошибки не кэшируются.
func publicCache(w http.ResponseWriter, seconds int) {
	w.Header().Set("Cache-Control", "public, max-age="+strconv.Itoa(seconds))
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleReady — готовность: процесс жив И база отвечает (для балансировщика).
func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.store.Ping(ctx); err != nil {
		writeError(w, http.StatusServiceUnavailable, "База данных недоступна")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}
