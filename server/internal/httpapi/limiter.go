package httpapi

import (
	"context"
	"sync"
	"time"
)

// rateLimiter — скользящее окно по ключу (обычно IP), в памяти процесса.
// Это первый, дешёвый рубеж: он не даёт флуду дойти до БД. Он приблизительный
// при нескольких инстансах (у каждого свой счётчик); авторитетная защита входа —
// таблица login_attempts в БД (см. store/guard.go).
type rateLimiter struct {
	mu      sync.Mutex
	buckets map[string][]time.Time
	limit   int
	window  time.Duration
	maxKeys int
}

// maxLimiterKeys ограничивает память: при переполнении мусор вычищается,
// а новые ключи сверх лимита просто не учитываются (limiter — best-effort).
const maxLimiterKeys = 100_000

func newRateLimiter(ctx context.Context, limit int, window time.Duration) *rateLimiter {
	rl := &rateLimiter{buckets: make(map[string][]time.Time), limit: limit, window: window, maxKeys: maxLimiterKeys}
	go func() {
		t := time.NewTicker(5 * time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				rl.mu.Lock()
				rl.sweepLocked(time.Now())
				rl.mu.Unlock()
			}
		}
	}()
	return rl
}

func (rl *rateLimiter) sweepLocked(now time.Time) {
	cutoff := now.Add(-rl.window)
	for k, hits := range rl.buckets {
		if len(hits) == 0 || hits[len(hits)-1].Before(cutoff) {
			delete(rl.buckets, k)
		}
	}
}

func (rl *rateLimiter) recent(key string, now time.Time) []time.Time {
	cutoff := now.Add(-rl.window)
	hits := rl.buckets[key]
	kept := make([]time.Time, 0, len(hits)+1) // новый срез: исходный может читаться параллельно
	for _, t := range hits {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	return kept
}

// allow регистрирует попытку и возвращает false, если лимит превышен.
func (rl *rateLimiter) allow(key string) bool {
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()
	hits := rl.recent(key, now)
	if len(hits) >= rl.limit {
		rl.buckets[key] = hits
		return false
	}
	rl.store(key, append(hits, now), now)
	return true
}

// count — сколько событий по ключу в окне (без регистрации нового).
func (rl *rateLimiter) count(key string) int {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	return len(rl.recent(key, time.Now()))
}

// add регистрирует событие без проверки лимита.
func (rl *rateLimiter) add(key string) {
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()
	rl.store(key, append(rl.recent(key, now), now), now)
}

func (rl *rateLimiter) store(key string, hits []time.Time, now time.Time) {
	if _, exists := rl.buckets[key]; !exists && len(rl.buckets) >= rl.maxKeys {
		rl.sweepLocked(now)
		if len(rl.buckets) >= rl.maxKeys {
			return // переполнено — не запоминаем новый ключ
		}
	}
	rl.buckets[key] = hits
}
