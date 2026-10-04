package httpapi

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"
	"time"

	"marshrut-api/internal/store"
)

// maxAdminKeyFailures — сколько неверных админ-ключей с одного IP за 15 минут,
// после чего IP получает 429 (даже с верным ключом): перебор ключа нереален.
const maxAdminKeyFailures = 10

// rateLimit — 429, если превышен лимит запросов для IP клиента.
func (s *Server) rateLimit(rl *rateLimiter, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !rl.allow(s.clientIP(r)) {
			writeError(w, http.StatusTooManyRequests, "Слишком много попыток. Попробуйте через минуту.")
			return
		}
		next(w, r)
	}
}

// auth проверяет токен и то, что его сессия — текущая (одна активная сессия на
// аккаунт), и кладёт id пользователя в контекст.
func (s *Server) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		claims, err := s.signer.Parse(token)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Требуется авторизация")
			return
		}
		current, err := s.sessionID(r.Context(), claims.UID)
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusUnauthorized, "Требуется авторизация")
			return
		}
		if err != nil {
			// Сбой БД — не «вы не авторизованы»: иначе клиент разлогинит пользователя.
			s.log.Error("проверка сессии", "request_id", requestID(r.Context()), "err", err)
			writeError(w, http.StatusServiceUnavailable, "Сервис временно недоступен")
			return
		}
		// пусто = токен выдан до появления sid — пропускаем (легаси)
		if current != "" && current != claims.SID {
			writeError(w, http.StatusUnauthorized, "Сессия завершена: выполнен вход с другого устройства")
			return
		}
		ctx := context.WithValue(r.Context(), ctxUserID, claims.UID)
		next(w, r.WithContext(ctx))
	}
}

func (s *Server) sessionID(ctx context.Context, uid int64) (string, error) {
	if sid, ok := s.sessions.Get(uid); ok {
		return sid, nil
	}
	sid, err := s.store.SessionID(ctx, uid)
	if err == nil {
		s.sessions.Put(uid, sid)
	}
	return sid, err
}

func currentUID(r *http.Request) int64 {
	uid, _ := r.Context().Value(ctxUserID).(int64)
	return uid
}

// admin — цепочка защит админки: IP-фильтр → лимит запросов → админ-ключ.
func (s *Server) admin(next http.HandlerFunc) http.HandlerFunc {
	return s.adminIPGuard(s.rateLimit(s.adminLimiter, s.adminKeyGuard(next)))
}

// adminIPGuard: 403, если задан ADMIN_ALLOWED_IPS и IP клиента в нём нет.
func (s *Server) adminIPGuard(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		allowed := s.cfg.AdminAllowedIPs
		if len(allowed) == 0 {
			next(w, r)
			return
		}
		ip := s.clientIP(r)
		for _, a := range allowed {
			if a == ip {
				next(w, r)
				return
			}
		}
		writeError(w, http.StatusForbidden, "Доступ к админке с этого IP запрещён")
	}
}

// adminKeyGuard проверяет X-Admin-Key (заголовок, не query — query оседает в
// логах). Сравнение — по SHA-256 за постоянное время: не зависит ни от длины,
// ни от общего префикса ключа. Неверные ключи считаются по IP.
func (s *Server) adminKeyGuard(next http.HandlerFunc) http.HandlerFunc {
	want := sha256.Sum256([]byte(s.cfg.AdminKey))
	return func(w http.ResponseWriter, r *http.Request) {
		if s.cfg.AdminKey == "" {
			writeError(w, http.StatusForbidden, "Админ-доступ отключён: не задан ADMIN_KEY")
			return
		}
		ip := s.clientIP(r)
		if s.adminFails.count(ip) >= maxAdminKeyFailures {
			writeError(w, http.StatusTooManyRequests, "Слишком много неверных ключей. Попробуйте позже.")
			return
		}
		got := sha256.Sum256([]byte(r.Header.Get("X-Admin-Key")))
		if subtle.ConstantTimeCompare(got[:], want[:]) != 1 {
			s.adminFails.add(ip)
			writeError(w, http.StatusUnauthorized, "Неверный ключ")
			return
		}
		next(w, r)
	}
}

// audit пишет админ-действие в журнал. Ошибка записи не роняет запрос (действие
// уже выполнено) — только логируется; запись не зависит от отмены запроса клиентом.
func (s *Server) audit(r *http.Request, action, target, detail string) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 3*time.Second)
	defer cancel()
	if err := s.store.LogAdmin(ctx, action, target, detail, s.clientIP(r)); err != nil {
		s.log.Error("не удалось записать audit-лог", "action", action, "target", target, "err", err)
	}
}
