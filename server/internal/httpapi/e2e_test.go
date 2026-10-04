//go:build integration

package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"marshrut-api/internal/config"
	"marshrut-api/internal/content"
	"marshrut-api/internal/store"
	"marshrut-api/internal/testdb"
)

var pg *testdb.Server

func TestMain(m *testing.M) {
	var err error
	pg, err = testdb.Start()
	if err != nil {
		fmt.Fprintln(os.Stderr, "не удалось запустить Postgres:", err)
		os.Exit(1)
	}
	code := m.Run()
	pg.Stop()
	os.Exit(code)
}

const adminKey = "e2e-admin-key-e2e-admin-key"

type env struct {
	t  *testing.T
	ts *httptest.Server
	st *store.Store
	c  *http.Client
}

func newEnv(t *testing.T) *env { return newEnvWith(t, nil) }

// newEnvWith позволяет подправить Server до сборки маршрутов (лимитеры захватываются при Handler()).
func newEnvWith(t *testing.T, tweak func(context.Context, *Server)) *env {
	t.Helper()
	dsn, err := pg.NewDB()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	st, err := store.Open(ctx, dsn, 5)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	if err := st.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err := st.SeedReference(ctx); err != nil {
		t.Fatal(err)
	}
	ct, err := content.Load()
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{
		JWTSecret: []byte("e2e-secret-e2e-secret-e2e-secret"), AdminKey: adminKey,
		TrustedProxyHops: 1, AllowedOrigins: []string{"*"}, SessionCacheTTL: 15e9, DBMaxConns: 5,
	}
	srv := New(ctx, cfg, st, ct, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if tweak != nil {
		tweak(ctx, srv)
	}
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	return &env{t: t, ts: ts, st: st, c: &http.Client{Transport: &http.Transport{DisableCompression: true}}}
}

type opt func(*http.Request)

func bearer(tok string) opt {
	return func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+tok) }
}
func admin() opt { return func(r *http.Request) { r.Header.Set("X-Admin-Key", adminKey) } }
func header(k, v string) opt {
	return func(r *http.Request) { r.Header.Set(k, v) }
}

// ip задаёт «реальный» адрес клиента так, как его дописывает прокси: последней записью.
func ip(addr string) opt { return header("X-Forwarded-For", addr) }

func (e *env) do(method, path string, body any, opts ...opt) (int, http.Header, []byte) {
	e.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, e.ts.URL+path, rd)
	req.Header.Set("Content-Type", "application/json")
	for _, o := range opts {
		o(req)
	}
	resp, err := e.c.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, resp.Header, b
}

func (e *env) json(method, path string, body any, opts ...opt) (int, map[string]any) {
	e.t.Helper()
	code, _, b := e.do(method, path, body, opts...)
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	return code, m
}

// mkUser создаёт пользователя через админку и возвращает (id, email, password).
func (e *env) mkUser(name string) (int64, string, string) {
	e.t.Helper()
	email := strings.ToLower(name) + "@e2e.kz"
	code, m := e.json("POST", "/api/admin/create-user", map[string]string{"name": name, "email": email, "password": "password-" + name}, admin())
	if code != 200 {
		e.t.Fatalf("create-user: %d %v", code, m)
	}
	return int64(m["id"].(float64)), email, "password-" + name
}

func (e *env) login(email, pw string, opts ...opt) (int, string) {
	e.t.Helper()
	code, m := e.json("POST", "/api/auth/login", map[string]string{"email": email, "password": pw}, opts...)
	tok, _ := m["token"].(string)
	return code, tok
}

func (e *env) mustLogin(email, pw string) string {
	e.t.Helper()
	code, tok := e.login(email, pw, ip("10.10.10.10"))
	if code != 200 {
		e.t.Fatalf("login %s: %d", email, code)
	}
	return tok
}

func TestUserJourney(t *testing.T) {
	e := newEnv(t)
	_, email, pw := e.mkUser("Journey")
	tok := e.mustLogin(email, pw)

	code, me := e.json("GET", "/api/me", nil, bearer(tok))
	if code != 200 || me["email"] != email {
		t.Fatalf("me: %d %v", code, me)
	}
	if code, _ := e.json("GET", "/api/me", nil); code != 401 {
		t.Errorf("me без токена: %d", code)
	}
	if code, _ := e.json("GET", "/api/me", nil, bearer("garbage.token")); code != 401 {
		t.Errorf("me с мусорным токеном: %d", code)
	}

	code, me = e.json("PUT", "/api/profile", map[string]any{"fullName": " Иван ", "city": "Алматы", "foreignScore": 30}, bearer(tok))
	if code != 200 || me["name"] != "Иван" {
		t.Errorf("profile: %d %v", code, me)
	}
	if code, _ := e.json("PUT", "/api/profile", map[string]any{"foreignScore": -1}, bearer(tok)); code != 400 {
		t.Errorf("отрицательный балл принят: %d", code)
	}
	if code, _ := e.json("PUT", "/api/profile", map[string]any{"foreignScore": 5000}, bearer(tok)); code != 400 {
		t.Errorf("огромный балл принят: %d", code)
	}

	code, me = e.json("POST", "/api/favorites/toggle", map[string]string{"code": "7M01"}, bearer(tok))
	if code != 200 || len(me["favorites"].([]any)) != 1 {
		t.Errorf("favorites: %d %v", code, me["favorites"])
	}

	png := "data:image/png;base64,iVBORw0KGgo="
	if code, me = e.json("PUT", "/api/profile/avatar", map[string]string{"avatar": png}, bearer(tok)); code != 200 || me["profile"].(map[string]any)["avatar"] != png {
		t.Errorf("avatar: %d", code)
	}
	if code, _ := e.json("PUT", "/api/profile/avatar", map[string]string{"avatar": "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="}, bearer(tok)); code != 400 {
		t.Errorf("svg-аватар принят: %d", code)
	}

	if code, m := e.json("GET", "/api/roadmap", nil, bearer(tok)); code != 200 || m["steps"] == nil {
		t.Errorf("roadmap: %d %v", code, m)
	}
	if code, _, _ := e.do("GET", "/api/specialities", nil); code != 200 {
		t.Errorf("specialities: %d", code)
	}
}

func TestInputValidation(t *testing.T) {
	e := newEnv(t)
	_, email, pw := e.mkUser("Valid")
	tok := e.mustLogin(email, pw)
	bad := []struct {
		name, path string
		body       any
	}{
		{"код с пробелом", "/api/favorites/toggle", map[string]string{"code": "a b"}},
		{"инъекция в коде", "/api/favorites/toggle", map[string]string{"code": "x'; DROP TABLE users;--"}},
		{"пустой код", "/api/favorites/toggle", map[string]string{"code": ""}},
	}
	for _, c := range bad {
		if code, _ := e.json("POST", c.path, c.body, bearer(tok)); code != 400 {
			t.Errorf("%s: %d, want 400", c.name, code)
		}
	}
	// слишком большое тело обрывается
	huge := map[string]string{"avatar": "data:image/png;base64," + strings.Repeat("A", 2<<20)}
	if code, _ := e.json("PUT", "/api/profile/avatar", huge, bearer(tok)); code != 400 {
		t.Errorf("тело 2 МБ: %d, want 400", code)
	}
	// лимит избранного
	for i := 0; i < store.MaxFavorites; i++ {
		if code, _ := e.json("POST", "/api/favorites/toggle", map[string]string{"code": fmt.Sprintf("C%d", i)}, bearer(tok)); code != 200 {
			t.Fatalf("избранное #%d: %d", i, code)
		}
	}
	if code, _ := e.json("POST", "/api/favorites/toggle", map[string]string{"code": "OVER"}, bearer(tok)); code != 400 {
		t.Errorf("сверх лимита избранного: %d", code)
	}
}

func TestSessionRevocation(t *testing.T) {
	e := newEnv(t)
	id, email, pw := e.mkUser("Sess")

	t1 := e.mustLogin(email, pw)
	t2 := e.mustLogin(email, pw) // вход с другого устройства вытесняет первый токен
	if code, _ := e.json("GET", "/api/me", nil, bearer(t1)); code != 401 {
		t.Errorf("вытесненный токен всё ещё работает: %d", code)
	}
	if code, _ := e.json("GET", "/api/me", nil, bearer(t2)); code != 200 {
		t.Errorf("актуальный токен не работает: %d", code)
	}

	if code, _ := e.json("POST", "/api/auth/logout", nil, bearer(t2)); code != 200 {
		t.Fatalf("logout: %d", code)
	}
	if code, _ := e.json("GET", "/api/me", nil, bearer(t2)); code != 401 {
		t.Errorf("токен после logout работает (кэш сессий не сброшен?): %d", code)
	}

	t3 := e.mustLogin(email, pw)
	if code, m := e.json("POST", "/api/admin/reset-password", map[string]any{"id": id}, admin()); code != 200 || m["password"] == nil {
		t.Fatalf("reset-password: %d %v", code, m)
	}
	if code, _ := e.json("GET", "/api/me", nil, bearer(t3)); code != 401 {
		t.Errorf("сессия пережила сброс пароля: %d", code)
	}
	if code, _ := e.login(email, pw, ip("10.10.10.10")); code != 401 {
		t.Errorf("старый пароль после сброса: %d", code)
	}

	t4 := e.mustLoginWith(email, m2pw(t, e, id))
	e.json("POST", "/api/admin/delete-user", map[string]any{"id": id}, admin())
	if code, _ := e.json("GET", "/api/me", nil, bearer(t4)); code != 401 {
		t.Errorf("токен удалённого пользователя работает: %d", code)
	}
}

// m2pw сбрасывает пароль и возвращает новый (нужен тесту, чтобы войти заново).
func m2pw(t *testing.T, e *env, id int64) string {
	_, m := e.json("POST", "/api/admin/reset-password", map[string]any{"id": id}, admin())
	return m["password"].(string)
}

func (e *env) mustLoginWith(email, pw string) string { return e.mustLogin(email, pw) }

// noLoginRateLimit отключает дешёвый in-memory лимит по IP, чтобы тест проверял
// именно авторитетную защиту входа в БД (она — последний рубеж при нескольких инстансах).
func noLoginRateLimit(ctx context.Context, s *Server) {
	s.loginLimiter = newRateLimiter(ctx, 100000, time.Minute)
}

func TestLoginLockoutIsolation(t *testing.T) {
	e := newEnvWith(t, noLoginRateLimit)
	_, email, pw := e.mkUser("Victim")

	// атакующий с IP A перебирает пароль жертвы
	attacker := "203.0.113.7"
	for i := 0; i < loginPairMaxFails; i++ {
		if code, _ := e.login(email, "wrong", ip(attacker)); code != 401 {
			t.Fatalf("попытка %d: %d, want 401", i, code)
		}
	}
	// даже верный пароль от атакующего теперь отклоняется
	if code, _ := e.login(email, pw, ip(attacker)); code != 429 {
		t.Errorf("атакующий после порога: %d, want 429", code)
	}
	// подделка X-Forwarded-For слева не помогает: значим только адрес, дописанный прокси
	for i := 0; i < 3; i++ {
		spoof := fmt.Sprintf("198.51.100.%d, %s", i, attacker)
		if code, _ := e.login(email, pw, header("X-Forwarded-For", spoof)); code != 429 {
			t.Errorf("подделка XFF обошла блокировку: %d", code)
		}
	}
	// настоящий владелец с другого IP входит без проблем — чужой перебор его не блокирует
	if code, _ := e.login(email, pw, ip("192.0.2.55")); code != 200 {
		t.Errorf("владелец заблокирован чужим перебором: %d, want 200", code)
	}
}

func TestLoginDoesNotRevealAccountExistence(t *testing.T) {
	e := newEnvWith(t, noLoginRateLimit)
	e.mkUser("Real")
	sig := func(email string) [2]int {
		var out [2]int
		for i := 0; i < loginPairMaxFails; i++ {
			out[0], _ = e.login(email, "wrong", ip("203.0.113.20"))
		}
		out[1], _ = e.login(email, "wrong", ip("203.0.113.20"))
		return out
	}
	real, ghost := sig("real@e2e.kz"), sig("ghost@e2e.kz")
	if real != ghost {
		t.Errorf("ответы различаются для существующего %v и несуществующего %v логина", real, ghost)
	}
	if real != [2]int{401, 429} {
		t.Errorf("последовательность = %v, want [401 429]", real)
	}
}

func TestAdminSecurity(t *testing.T) {
	e := newEnv(t)
	if code, _ := e.json("GET", "/api/admin/users", nil); code != 401 {
		t.Errorf("без ключа: %d", code)
	}
	if code, _ := e.json("GET", "/api/admin/users", nil, header("X-Admin-Key", "wrong")); code != 401 {
		t.Errorf("неверный ключ: %d", code)
	}
	// ключ в query-строке не принимается (оседает в логах)
	if code, _ := e.json("GET", "/api/admin/users?key="+adminKey, nil); code != 401 {
		t.Errorf("ключ в query принят: %d", code)
	}
	if code, _ := e.json("GET", "/api/admin/users", nil, admin()); code != 200 {
		t.Errorf("верный ключ: %d", code)
	}

	// перебор ключа: после 10 неверных IP получает 429 даже с верным ключом
	for i := 0; i < maxAdminKeyFailures; i++ {
		e.json("GET", "/api/admin/users", nil, header("X-Admin-Key", fmt.Sprint("guess", i)), ip("198.51.100.99"))
	}
	if code, _ := e.json("GET", "/api/admin/users", nil, admin(), ip("198.51.100.99")); code != 429 {
		t.Errorf("после перебора: %d, want 429", code)
	}
	if code, _ := e.json("GET", "/api/admin/users", nil, admin(), ip("198.51.100.1")); code != 200 {
		t.Errorf("другой IP: %d", code)
	}

	// валидация создания аккаунта
	if code, _ := e.json("POST", "/api/admin/create-user", map[string]string{"email": "s@e2e.kz", "password": "short"}, admin()); code != 400 {
		t.Errorf("короткий пароль: %d", code)
	}
	if code, _ := e.json("POST", "/api/admin/create-user", map[string]string{"email": "l@e2e.kz", "password": strings.Repeat("x", 73)}, admin()); code != 400 {
		t.Errorf("пароль >72 байт: %d", code)
	}
	e.mkUser("Dup")
	if code, _ := e.json("POST", "/api/admin/create-user", map[string]string{"email": "dup@e2e.kz"}, admin()); code != 409 {
		t.Errorf("дубль логина: %d, want 409", code)
	}
	// ответы админки с паролями не кэшируются
	_, h, _ := e.do("POST", "/api/admin/create-user", map[string]string{"email": "nc@e2e.kz"}, admin())
	if h.Get("Cache-Control") != "no-store" {
		t.Errorf("Cache-Control ответа с паролем: %q", h.Get("Cache-Control"))
	}

	// журнал фиксирует действия
	_, m := e.json("GET", "/api/admin/audit-log", nil, admin())
	if entries, _ := m["entries"].([]any); len(entries) < 2 {
		t.Errorf("audit-log: %v", m)
	}
}

func TestPublicAndOperationalEndpoints(t *testing.T) {
	e := newEnv(t)
	code, h, _ := e.do("GET", "/api/specialities", nil)
	if code != 200 || !strings.Contains(h.Get("Cache-Control"), "max-age") {
		t.Errorf("specialities: %d Cache-Control=%q", code, h.Get("Cache-Control"))
	}
	if code, h, _ = e.do("GET", "/api/health", nil); code != 200 || h.Get("Cache-Control") != "no-store" {
		t.Errorf("health: %d Cache-Control=%q", code, h.Get("Cache-Control"))
	}
	if code, _, _ = e.do("GET", "/api/ready", nil); code != 200 {
		t.Errorf("ready: %d", code)
	}
	if h.Get("X-Request-Id") == "" || h.Get("X-Content-Type-Options") != "nosniff" {
		t.Error("нет служебных заголовков")
	}
	if code, _, _ = e.do("POST", "/api/auth/register", map[string]string{"email": "a@b.c"}); code != 403 {
		t.Errorf("регистрация должна быть закрыта: %d", code)
	}
	// БД упала → ready сообщает 503, а auth не выдаёт ложных 401
	_, email, pw := e.mkUser("Outage")
	tok := e.mustLogin(email, pw)
	e.st.Close()
	if code, _, _ = e.do("GET", "/api/ready", nil); code != 503 {
		t.Errorf("ready при недоступной БД: %d, want 503", code)
	}
	e.st.Close()
	// токен в кэше сессий переживает сбой БД, но запрос данных отдаёт ошибку сервера, а не 401
	code, _, _ = e.do("GET", "/api/me", nil, bearer(tok))
	if code == 401 || code == 200 {
		t.Errorf("при сбое БД ожидалась 5xx, got %d", code)
	}
}
