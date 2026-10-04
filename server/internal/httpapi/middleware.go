package httpapi

import (
	"context"
	crand "crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"regexp"
	"runtime/debug"
	"strings"
	"time"
)

type ctxKey int

const (
	ctxUserID ctxKey = iota
	ctxRequestID
)

// statusRecorder запоминает код и размер ответа для access-лога.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (r *statusRecorder) WriteHeader(code int) {
	if r.status == 0 {
		r.status = code
	}
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	n, err := r.ResponseWriter.Write(b)
	r.bytes += n
	return n, err
}

var validRequestID = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)

func newRequestID() string {
	b := make([]byte, 8)
	_, _ = crand.Read(b)
	return hex.EncodeToString(b)
}

// withRequestID присваивает запросу идентификатор (или принимает безопасный
// входящий от прокси) — по нему связываются строки лога и жалобы пользователей.
func withRequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-Id")
		if !validRequestID.MatchString(id) {
			id = newRequestID()
		}
		w.Header().Set("X-Request-Id", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxRequestID, id)))
	})
}

func requestID(ctx context.Context) string {
	id, _ := ctx.Value(ctxRequestID).(string)
	return id
}

// withRecover: паника в хендлере не должна ронять процесс и обрывать соединение
// без ответа — логируем стек и отдаём 500.
func (s *Server) withRecover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				if rec == http.ErrAbortHandler {
					panic(rec)
				}
				s.log.Error("panic в обработчике",
					"request_id", requestID(r.Context()), "path", r.URL.Path,
					"panic", rec, "stack", string(debug.Stack()))
				writeError(w, http.StatusInternalServerError, "Ошибка сервера")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// withAccessLog пишет одну строку на запрос. В лог не попадают query-строка,
// заголовки и тело — там могут быть токены и пароли.
func (s *Server) withAccessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		level := slog.LevelInfo
		if r.URL.Path == "/api/health" || r.URL.Path == "/api/ready" {
			level = slog.LevelDebug // пробы живости не засоряют лог
		}
		s.log.Log(r.Context(), level, "request",
			"request_id", requestID(r.Context()),
			"method", r.Method, "path", r.URL.Path,
			"status", rec.status, "bytes", rec.bytes,
			"ms", time.Since(start).Milliseconds(),
			"ip", s.clientIP(r))
	})
}

// withSecurityHeaders — защитные заголовки; ответы API по умолчанию не кэшируются
// (пароли, токены, персональные данные), а публичные справочники и контент
// тестов переопределяют Cache-Control сами.
func withSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		// Чистый JSON API — не отдаёт HTML/скрипты/стили, поэтому запрещаем всё разом.
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		h.Set("Permissions-Policy", "geolocation=(), camera=(), microphone=()")
		h.Set("Cross-Origin-Resource-Policy", "cross-origin") // API читают с другого домена (фронт)
		h.Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// withCORS добавляет CORS-заголовки и отвечает на preflight. Авторизация идёт
// заголовком Authorization, не cookie, поэтому Allow-Credentials не нужен.
func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", s.resolveOrigin(r.Header.Get("Origin")))
		h.Add("Vary", "Origin")
		h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Key")
		h.Set("Access-Control-Max-Age", "600") // браузер кэширует preflight — меньше лишних запросов
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// resolveOrigin возвращает значение Access-Control-Allow-Origin: "*", если так
// настроено; иначе origin запроса, если он в списке (или это localhost для
// разработки, или "null" — страница открыта с диска), иначе первый из списка.
func (s *Server) resolveOrigin(reqOrigin string) string {
	origins := s.cfg.AllowedOrigins
	if len(origins) == 0 {
		return "*"
	}
	for _, o := range origins {
		if o == "*" {
			return "*"
		}
	}
	for _, o := range origins {
		if o == reqOrigin {
			return reqOrigin
		}
	}
	if strings.HasPrefix(reqOrigin, "http://localhost:") || strings.HasPrefix(reqOrigin, "http://127.0.0.1:") || reqOrigin == "null" {
		return reqOrigin
	}
	return origins[0]
}

func (s *Server) clientIP(r *http.Request) string { return clientIP(r, s.cfg.TrustedProxyHops) }
