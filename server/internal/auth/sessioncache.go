package auth

import (
	"sync"
	"time"
)

// SessionCache — короткий кэш users.session_id: middleware авторизации работает
// на каждый запрос, а соединений с БД мало. Вход/выход/удаление на ЭТОМ
// инстансе сбрасывают запись сразу; на других инстансах отзыв виден не позже TTL.
// TTL = 0 отключает кэш.
type SessionCache struct {
	mu  sync.Mutex
	m   map[int64]entry
	ttl time.Duration
	max int
}

type entry struct {
	sid string
	exp time.Time
}

func NewSessionCache(ttl time.Duration, max int) *SessionCache {
	return &SessionCache{m: make(map[int64]entry), ttl: ttl, max: max}
}

func (c *SessionCache) Get(uid int64) (string, bool) {
	if c.ttl <= 0 {
		return "", false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[uid]
	if !ok || time.Now().After(e.exp) {
		delete(c.m, uid)
		return "", false
	}
	return e.sid, true
}

func (c *SessionCache) Put(uid int64, sid string) {
	if c.ttl <= 0 {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.m) >= c.max { // проще сбросить всё, чем вести LRU
		c.m = make(map[int64]entry)
	}
	c.m[uid] = entry{sid: sid, exp: time.Now().Add(c.ttl)}
}

func (c *SessionCache) Drop(uid int64) {
	c.mu.Lock()
	delete(c.m, uid)
	c.mu.Unlock()
}
