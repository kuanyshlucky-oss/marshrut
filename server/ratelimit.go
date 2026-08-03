package main

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Простой in-memory rate-limiter по IP (скользящее окно).
// Достаточно для одного инстанса; переживает рестарт (сбрасывается — не критично).

type rateBucket struct {
	hits []time.Time
}

type rateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*rateBucket
	limit   int
	window  time.Duration
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	rl := &rateLimiter{buckets: make(map[string]*rateBucket), limit: limit, window: window}
	go rl.gc()
	return rl
}

// gc периодически чистит старые бакеты, чтобы карта не росла бесконечно.
func (rl *rateLimiter) gc() {
	for {
		time.Sleep(10 * time.Minute)
		cutoff := time.Now().Add(-rl.window)
		rl.mu.Lock()
		for k, b := range rl.buckets {
			if len(b.hits) == 0 || b.hits[len(b.hits)-1].Before(cutoff) {
				delete(rl.buckets, k)
			}
		}
		rl.mu.Unlock()
	}
}

// allow регистрирует попытку для key и возвращает false, если лимит превышен.
func (rl *rateLimiter) allow(key string) bool {
	now := time.Now()
	cutoff := now.Add(-rl.window)

	rl.mu.Lock()
	defer rl.mu.Unlock()

	b, ok := rl.buckets[key]
	if !ok {
		b = &rateBucket{}
		rl.buckets[key] = b
	}
	// выкидываем устаревшие попытки из окна
	kept := b.hits[:0]
	for _, t := range b.hits {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	b.hits = kept

	if len(b.hits) >= rl.limit {
		return false
	}
	b.hits = append(b.hits, now)
	return true
}

func clientIP(r *http.Request) string {
	// Render/большинство прокси кладут реальный IP в X-Forwarded-For (первый в списке)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		for i := 0; i < len(xff); i++ {
			if xff[i] == ',' {
				return xff[:i]
			}
		}
		return xff
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

var loginLimiter = newRateLimiter(5, time.Minute)  // 5 попыток входа в минуту с одного IP
var adminLimiter = newRateLimiter(20, time.Minute) // мягче — это админ, но тоже защищаем

// rateLimit — мидлвар: 429, если превышен лимит для IP клиента.
func rateLimit(rl *rateLimiter, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !rl.allow(clientIP(r)) {
			writeError(w, http.StatusTooManyRequests, "Слишком много попыток. Попробуйте через минуту.")
			return
		}
		next(w, r)
	}
}

// ADMIN_ALLOWED_IPS — необязательный список IP через запятую, с которых разрешён
// доступ к /api/admin/*. Пусто (по умолчанию) = ограничение выключено, работает
// как раньше — только по ADMIN_KEY. Задавать имеет смысл, если у админа
// статический IP/VPN — тогда даже утечка ключа не даст зайти с чужого адреса.
var adminAllowedIPs = env("ADMIN_ALLOWED_IPS", "")

// adminIPGuard — мидлвар: 403, если IP клиента не в ADMIN_ALLOWED_IPS (когда задан).
func adminIPGuard(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if adminAllowedIPs == "" {
			next(w, r)
			return
		}
		ip := clientIP(r)
		for _, allowed := range strings.Split(adminAllowedIPs, ",") {
			if strings.TrimSpace(allowed) == ip {
				next(w, r)
				return
			}
		}
		writeError(w, http.StatusForbidden, "Доступ к админке с этого IP запрещён")
	}
}
