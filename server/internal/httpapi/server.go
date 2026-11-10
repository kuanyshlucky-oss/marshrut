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
	"marshrut-api/internal/mail"
	"marshrut-api/internal/payments"
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
	demoLimiter  *rateLimiter // демо-вопросы с одного IP (публичный маршрут)
	shopLimiter  *rateLimiter // создание заказов и заявки «я оплатил» с одного IP
	hookLimiter  *rateLimiter // уведомления об оплате с одного IP
	pwLimiter    *rateLimiter // установка пароля по ссылке с одного IP

	payments payments.Provider // провайдер оплаты
	mailer   mail.Sender       // nil — SMTP не настроен: письма только копятся в очереди

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
		adminLimiter: newRateLimiter(ctx, 120, time.Minute),
		adminFails:   newRateLimiter(ctx, maxAdminKeyFailures, 15*time.Minute),
		demoLimiter:  newRateLimiter(ctx, 30, time.Minute),
		shopLimiter:  newRateLimiter(ctx, 20, time.Hour),
		hookLimiter:  newRateLimiter(ctx, 300, time.Minute),
		pwLimiter:    newRateLimiter(ctx, 10, time.Minute),
		dummyHash:    dummy,
	}
	prov, err := payments.New(payments.Settings{
		Provider: cfg.PaymentsProvider, WebhookSecret: cfg.PaymentsWebhookSecret, PayURLTemplate: cfg.PaymentsPayURL,
		KaspiQRImageURL: cfg.KaspiQRImageURL, KaspiQRPayURL: cfg.KaspiQRPayURL,
	})
	if err != nil { // конфигурация уже проверена в config.Load; сюда попадаем только при ошибке сборки
		log.Error("платёжный провайдер не настроен, используется kaspi_qr", "err", err)
		prov, _ = payments.New(payments.Settings{Provider: "kaspi_qr"})
	}
	s.payments = prov
	if cfg.SMTPHost != "" {
		s.mailer = &mail.SMTP{Host: cfg.SMTPHost, Port: cfg.SMTPPort, User: cfg.SMTPUser, Pass: cfg.SMTPPass, From: cfg.SMTPFrom}
		go s.mailWorker(ctx)
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
			if _, err := s.store.PurgeOldEmails(c, 14*24*time.Hour, time.Now()); err != nil {
				s.log.Warn("не удалось очистить старые письма", "err", err)
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

	// Продажа доступа
	mux.HandleFunc("GET /api/shop/products", s.handleShopProducts)
	mux.HandleFunc("POST /api/shop/orders", s.rateLimit(s.shopLimiter, s.handleCreateOrder))
	mux.HandleFunc("GET /api/shop/orders/{id}", s.handleOrderStatus)
	mux.HandleFunc("POST /api/shop/orders/{id}/claim", s.rateLimit(s.shopLimiter, s.handleClaimOrder))
	mux.HandleFunc("POST /api/payments/webhook/{provider}", s.rateLimit(s.hookLimiter, s.handlePaymentWebhook))
	mux.HandleFunc("POST /api/auth/set-password", s.rateLimit(s.pwLimiter, s.handleSetPassword))

	// Демо: бесплатные вопросы теста, без входа
	mux.HandleFunc("GET /api/demo/{code}", s.rateLimit(s.demoLimiter, s.handleDemo))

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
	mux.HandleFunc("GET /api/admin/usage", s.admin(s.handleAdminUsage))
	mux.HandleFunc("GET /api/admin/orders", s.admin(s.handleAdminOrders))
	mux.HandleFunc("POST /api/admin/orders/confirm", s.admin(s.handleAdminConfirmOrder))
	mux.HandleFunc("POST /api/admin/orders/refund", s.admin(s.handleAdminRefundOrder))
	mux.HandleFunc("POST /api/admin/orders/resend", s.admin(s.handleAdminResendAccess))
	mux.HandleFunc("GET /api/admin/outbox", s.admin(s.handleAdminOutbox))
	mux.HandleFunc("GET /api/admin/results", s.admin(s.handleAdminResults))
	mux.HandleFunc("POST /api/admin/bulk-create", s.admin(s.handleAdminBulkCreate))
	mux.HandleFunc("POST /api/admin/bulk-access", s.admin(s.handleAdminBulkAccess))
	mux.HandleFunc("POST /api/admin/set-note", s.admin(s.handleAdminSetNote))
	mux.HandleFunc("POST /api/admin/set-blocked", s.admin(s.handleAdminSetBlocked))
	mux.HandleFunc("POST /api/admin/end-session", s.admin(s.handleAdminEndSession))
	mux.HandleFunc("GET /api/admin/user-topics", s.admin(s.handleAdminUserTopics))
	mux.HandleFunc("GET /api/admin/hard-questions", s.admin(s.handleAdminHardQuestions))
	mux.HandleFunc("GET /api/admin/banks", s.admin(s.handleAdminBanks))
	mux.HandleFunc("GET /api/admin/banner", s.admin(s.handleAdminGetBanner))
	mux.HandleFunc("POST /api/admin/banner", s.admin(s.handleAdminSetBanner))
	mux.HandleFunc("GET /api/admin/flags", s.admin(s.handleAdminFlags))
	mux.HandleFunc("POST /api/admin/flag-question", s.admin(s.handleAdminFlagQuestion))
	mux.HandleFunc("POST /api/admin/resolve-flag", s.admin(s.handleAdminResolveFlag))
	mux.HandleFunc("GET /api/banner", s.handleBanner)
	mux.HandleFunc("GET /api/topic-totals", s.auth(s.handleTopicTotals))

	// Конспекты (картинки страниц) — только по доступу к курсу
	mux.HandleFunc("GET /api/konspekt/{course}/{file}", s.auth(s.handleKonspektImage))

	// МагистрТрек
	mux.HandleFunc("GET /api/universities", s.handleUniversities)
	mux.HandleFunc("GET /api/specialities", s.handleSpecialities)
	mux.HandleFunc("GET /api/calculate-chances", s.auth(s.handleCalculate))
	mux.HandleFunc("GET /api/roadmap", s.auth(s.handleRoadmap))
	mux.HandleFunc("POST /api/roadmap/toggle", s.auth(s.handleRoadmapToggle))

	// прогресс практики английского
	mux.HandleFunc("GET /api/practice", s.auth(s.handlePracticeGet))
	mux.HandleFunc("POST /api/practice/result", s.auth(s.handlePracticeSave))
	mux.HandleFunc("POST /api/practice/import", s.auth(s.handlePracticeImport))

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
