package httpapi

import (
	"compress/gzip"
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"marshrut-api/internal/config"
)

// testServer — Server без БД: хватает для middleware и защит, которые её не трогают.
func testServer(t *testing.T, mod func(*config.Config)) *Server {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	cfg := &config.Config{
		AdminKey: "admin-key-admin-key-1234", TrustedProxyHops: 1,
		AllowedOrigins: []string{"https://front.example"},
	}
	if mod != nil {
		mod(cfg)
	}
	return &Server{
		cfg: cfg, log: slog.New(slog.NewTextHandler(io.Discard, nil)),
		adminLimiter: newRateLimiter(ctx, 1000, time.Minute),
		adminFails:   newRateLimiter(ctx, maxAdminKeyFailures, 15*time.Minute),
	}
}

func TestIPFromRequest(t *testing.T) {
	cases := []struct {
		name, xff, remote string
		hops              int
		want              string
	}{
		{"без заголовка берём RemoteAddr", "", "9.9.9.9:1234", 1, "9.9.9.9"},
		{"один прокси — последняя запись", "9.9.9.9", "10.0.0.1:80", 1, "9.9.9.9"},
		{"подделанная первая запись игнорируется", "1.2.3.4, 9.9.9.9", "10.0.0.1:80", 1, "9.9.9.9"},
		{"hops=0: заголовку не верим", "1.2.3.4", "9.9.9.9:1", 0, "9.9.9.9"},
		{"два прокси", "6.6.6.6, 7.7.7.7, 8.8.8.8", "10.0.0.1:80", 2, "7.7.7.7"},
		{"цепочка короче hops — откат на RemoteAddr", "7.7.7.7", "10.0.0.1:80", 2, "10.0.0.1"},
		{"пробелы вокруг записей", "1.1.1.1 ,  2.2.2.2 ", "10.0.0.1:80", 1, "2.2.2.2"},
		{"адрес без порта", "", "9.9.9.9", 1, "9.9.9.9"},
	}
	for _, c := range cases {
		if got := ipFromRequest(c.xff, c.remote, c.hops); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}

func TestRateLimiter(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	rl := newRateLimiter(ctx, 3, time.Minute)
	for i := 0; i < 3; i++ {
		if !rl.allow("k") {
			t.Fatalf("попытка %d должна пройти", i)
		}
	}
	if rl.allow("k") {
		t.Error("четвёртая попытка должна быть отклонена")
	}
	if !rl.allow("other") {
		t.Error("другой ключ не должен затрагиваться")
	}
}

func TestRateLimiterCountDoesNotCorrupt(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	rl := newRateLimiter(ctx, 100, 50*time.Millisecond)
	rl.add("k")
	rl.add("k")
	time.Sleep(70 * time.Millisecond)
	rl.add("k")
	if n := rl.count("k"); n != 1 {
		t.Errorf("count = %d, want 1 (два события вышли из окна)", n)
	}
	if n := rl.count("k"); n != 1 {
		t.Errorf("повторный count изменил результат: %d", n)
	}
}

func TestRateLimiterBoundedMemory(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	rl := newRateLimiter(ctx, 5, time.Minute)
	rl.maxKeys = 100
	for i := 0; i < 1000; i++ {
		rl.allow("ip-" + string(rune('a'+i%26)) + strings.Repeat("x", i%50) + string(rune(i)))
	}
	rl.mu.Lock()
	n := len(rl.buckets)
	rl.mu.Unlock()
	if n > 100 {
		t.Errorf("карта выросла до %d ключей при лимите 100", n)
	}
}

func TestRateLimiterConcurrent(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	rl := newRateLimiter(ctx, 50, time.Minute)
	var wg sync.WaitGroup
	var mu sync.Mutex
	allowed := 0
	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if rl.allow("same") {
				mu.Lock()
				allowed++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if allowed != 50 {
		t.Errorf("пропущено %d запросов, ожидалось ровно 50", allowed)
	}
}

func TestValidation(t *testing.T) {
	for _, ok := range []string{"7M01", "M149", "kt:profile", "a.b_c-d"} {
		if !validCode(ok) {
			t.Errorf("validCode(%q) = false", ok)
		}
	}
	for _, bad := range []string{"", " ", "7M01; DROP TABLE users", strings.Repeat("a", 41), "код", "a b", "../etc"} {
		if validCode(bad) {
			t.Errorf("validCode(%q) = true", bad)
		}
	}
	if got := len([]rune(clip(strings.Repeat("я", 500), 100))); got != 100 {
		t.Errorf("clip: %d рун", got)
	}
	if clip("  x  ", 10) != "x" {
		t.Error("clip должен обрезать пробелы")
	}
	if normalizeLang("kz") != "kk" || normalizeLang("kk") != "kk" || normalizeLang("") != "ru" || normalizeLang("en") != "ru" {
		t.Error("normalizeLang")
	}
}

func TestValidAvatar(t *testing.T) {
	ok := "data:image/png;base64,iVBORw0KGgo="
	if !validAvatar(ok) {
		t.Error("корректный PNG отклонён")
	}
	for name, bad := range map[string]string{
		"svg":         "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
		"не base64":   "data:image/png;base64,***not base64***",
		"пусто":       "data:image/png;base64,",
		"не картинка": "data:text/html;base64,PGh0bWw+",
		"http":        "http://evil.example/a.png",
		"огромный":    "data:image/png;base64," + strings.Repeat("A", maxAvatarDataURLLen),
	} {
		if validAvatar(bad) {
			t.Errorf("%s: принят", name)
		}
	}
}

func TestAtoiSafe(t *testing.T) {
	for in, want := range map[string]int{"": 0, "30": 30, "30abc": 30, "abc": 0, "-5": 0, "99999999999999999999": 1_000_000} {
		if got := atoiSafe(in); got != want {
			t.Errorf("atoiSafe(%q) = %d, want %d", in, got, want)
		}
	}
}

func TestAdminIPGuardIgnoresSpoofedForwardedFor(t *testing.T) {
	s := testServer(t, func(c *config.Config) { c.AdminAllowedIPs = []string{"1.2.3.4"} })
	h := s.adminIPGuard(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })

	// злоумышленник 9.9.9.9 подставил разрешённый адрес первым; прокси дописал реальный
	r := httptest.NewRequest("GET", "/x", nil)
	r.RemoteAddr = "10.0.0.1:80"
	r.Header.Set("X-Forwarded-For", "1.2.3.4, 9.9.9.9")
	w := httptest.NewRecorder()
	h(w, r)
	if w.Code != http.StatusForbidden {
		t.Errorf("подделка X-Forwarded-For обошла ADMIN_ALLOWED_IPS: %d", w.Code)
	}

	r = httptest.NewRequest("GET", "/x", nil)
	r.RemoteAddr = "10.0.0.1:80"
	r.Header.Set("X-Forwarded-For", "1.2.3.4")
	w = httptest.NewRecorder()
	h(w, r)
	if w.Code != http.StatusOK {
		t.Errorf("разрешённый IP не пропущен: %d", w.Code)
	}
}

func TestAdminKeyGuard(t *testing.T) {
	s := testServer(t, nil)
	h := s.adminKeyGuard(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	do := func(key, ip string) int {
		r := httptest.NewRequest("GET", "/x", nil)
		r.RemoteAddr = ip + ":1"
		r.Header.Set("X-Forwarded-For", ip)
		if key != "" {
			r.Header.Set("X-Admin-Key", key)
		}
		w := httptest.NewRecorder()
		h(w, r)
		return w.Code
	}
	if c := do("admin-key-admin-key-1234", "5.5.5.5"); c != 200 {
		t.Errorf("верный ключ: %d", c)
	}
	if c := do("", "5.5.5.5"); c != 401 {
		t.Errorf("нет ключа: %d", c)
	}
	// перебор: после maxAdminKeyFailures неудач IP блокируется даже с верным ключом
	for i := 0; i < maxAdminKeyFailures; i++ {
		do("wrong-"+strings.Repeat("x", i), "6.6.6.6")
	}
	if c := do("admin-key-admin-key-1234", "6.6.6.6"); c != 429 {
		t.Errorf("после перебора верный ключ должен упираться в 429, got %d", c)
	}
	if c := do("admin-key-admin-key-1234", "7.7.7.7"); c != 200 {
		t.Errorf("другой IP не должен страдать от чужого перебора: %d", c)
	}
}

func TestAdminDisabledWithoutKey(t *testing.T) {
	s := testServer(t, func(c *config.Config) { c.AdminKey = "" })
	h := s.adminKeyGuard(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	r := httptest.NewRequest("GET", "/x", nil)
	r.Header.Set("X-Admin-Key", "") // пустой ключ не должен совпасть с пустым ADMIN_KEY
	w := httptest.NewRecorder()
	h(w, r)
	if w.Code != http.StatusForbidden {
		t.Errorf("без ADMIN_KEY админка должна быть закрыта: %d", w.Code)
	}
}

func TestRecoverMiddleware(t *testing.T) {
	s := testServer(t, nil)
	h := withRequestID(s.withRecover(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("boom")
	})))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/x", nil))
	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d", w.Code)
	}
	if strings.Contains(w.Body.String(), "boom") {
		t.Error("детали паники утекли клиенту")
	}
	if w.Header().Get("X-Request-Id") == "" {
		t.Error("нет X-Request-Id")
	}
}

func TestRequestIDSanitized(t *testing.T) {
	h := withRequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	for _, in := range []string{"bad id\r\nX-Evil: 1", strings.Repeat("a", 200), ""} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/x", nil)
		if in != "" {
			r.Header["X-Request-Id"] = []string{in}
		}
		h.ServeHTTP(w, r)
		got := w.Header().Get("X-Request-Id")
		if !validRequestID.MatchString(got) || got == in {
			t.Errorf("небезопасный request id пропущен: %q → %q", in, got)
		}
	}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/x", nil)
	r.Header.Set("X-Request-Id", "abc-123")
	h.ServeHTTP(w, r)
	if w.Header().Get("X-Request-Id") != "abc-123" {
		t.Error("безопасный входящий id должен сохраняться")
	}
}

func TestSecurityHeaders(t *testing.T) {
	h := withSecurityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/x", nil))
	for k, want := range map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "DENY",
		"Cache-Control":          "no-store",
	} {
		if got := w.Header().Get(k); got != want {
			t.Errorf("%s = %q, want %q", k, got, want)
		}
	}
	for _, k := range []string{"Strict-Transport-Security", "Content-Security-Policy", "Referrer-Policy"} {
		if w.Header().Get(k) == "" {
			t.Errorf("нет заголовка %s", k)
		}
	}
}

func TestCORS(t *testing.T) {
	s := testServer(t, nil)
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	h := s.withCORS(next)
	origin := func(o string) string {
		r := httptest.NewRequest("GET", "/x", nil)
		if o != "" {
			r.Header.Set("Origin", o)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Header().Get("Access-Control-Allow-Origin")
	}
	if got := origin("https://front.example"); got != "https://front.example" {
		t.Errorf("свой origin: %q", got)
	}
	if got := origin("https://evil.example"); got != "https://front.example" {
		t.Errorf("чужой origin не должен эхом возвращаться: %q", got)
	}
	if got := origin("http://localhost:5500"); got != "http://localhost:5500" {
		t.Errorf("localhost для разработки: %q", got)
	}
	// preflight
	r := httptest.NewRequest("OPTIONS", "/x", nil)
	r.Header.Set("Origin", "https://front.example")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusNoContent || w.Header().Get("Access-Control-Max-Age") == "" {
		t.Errorf("preflight: %d, max-age=%q", w.Code, w.Header().Get("Access-Control-Max-Age"))
	}
	// wildcard
	s2 := testServer(t, func(c *config.Config) { c.AllowedOrigins = []string{"*"} })
	w = httptest.NewRecorder()
	s2.withCORS(next).ServeHTTP(w, httptest.NewRequest("GET", "/x", nil))
	if w.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Error("wildcard")
	}
}

func gzipHandler(status int, contentType, body string, preEncoded bool) http.Handler {
	return withGzip(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}
		if preEncoded {
			w.Header().Set("Content-Encoding", "gzip")
		}
		w.WriteHeader(status)
		if body != "" {
			_, _ = io.WriteString(w, body)
		}
	}))
}

func TestGzipCompressesJSON(t *testing.T) {
	body := `{"a":"` + strings.Repeat("x", 1000) + `"}`
	r := httptest.NewRequest("GET", "/x", nil)
	r.Header.Set("Accept-Encoding", "gzip")
	w := httptest.NewRecorder()
	gzipHandler(200, "application/json", body, false).ServeHTTP(w, r)
	if w.Header().Get("Content-Encoding") != "gzip" {
		t.Fatal("ответ не сжат")
	}
	zr, err := gzip.NewReader(w.Body)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(zr)
	if string(got) != body {
		t.Error("после распаковки тело отличается")
	}
	if !strings.Contains(w.Header().Get("Vary"), "Accept-Encoding") {
		t.Error("нет Vary: Accept-Encoding")
	}
}

func TestGzipSkips(t *testing.T) {
	cases := map[string]struct {
		status int
		ct     string
		body   string
		pre    bool
		accept string
	}{
		"клиент не принимает gzip": {200, "application/json", "{}", false, ""},
		"304 без тела":             {304, "application/json", "", false, "gzip"},
		"204 без тела":             {204, "", "", false, "gzip"},
		"уже сжато":                {200, "application/json", "PRE-COMPRESSED", true, "gzip"},
		"не текстовый тип":         {200, "image/png", "PNG", false, "gzip"},
	}
	for name, c := range cases {
		r := httptest.NewRequest("GET", "/x", nil)
		if c.accept != "" {
			r.Header.Set("Accept-Encoding", c.accept)
		}
		w := httptest.NewRecorder()
		gzipHandler(c.status, c.ct, c.body, c.pre).ServeHTTP(w, r)
		enc := w.Header().Get("Content-Encoding")
		if c.pre {
			if enc != "gzip" || w.Body.String() != c.body {
				t.Errorf("%s: тело должно пройти как есть, enc=%q body=%q", name, enc, w.Body.String())
			}
			continue
		}
		if enc != "" {
			t.Errorf("%s: не должно быть сжатия, Content-Encoding=%q", name, enc)
		}
		if w.Body.String() != c.body {
			t.Errorf("%s: тело изменено: %q", name, w.Body.String())
		}
	}
}
