package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"marshrut-api/internal/content"
)

// demoMux — публичный маршрут демо так, как его регистрирует Handler().
func demoMux(t *testing.T, limit int) http.Handler {
	t.Helper()
	s := testServer(t, nil)
	ct, err := content.Load()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	s.content = ct
	s.demoLimiter = newRateLimiter(ctx, limit, time.Minute)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/demo/{code}", s.rateLimit(s.demoLimiter, s.handleDemo))
	return mux
}

func getDemo(h http.Handler, path string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("GET", path, nil)
	req.RemoteAddr = "9.9.9.9:1234"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestDemoPublicAndLimited(t *testing.T) {
	h := demoMux(t, 1000)
	rec := getDemo(h, "/api/demo/GOSSLUZHBA?lang=ru")
	if rec.Code != 200 {
		t.Fatalf("демо: %d %s", rec.Code, rec.Body)
	}
	var resp struct {
		Size      int `json:"size"`
		Questions []struct {
			ID       string          `json:"id"`
			Options  []string        `json:"options"`
			Correct  json.RawMessage `json:"correct"`
			Conspect string          `json:"conspect"`
		} `json:"questions"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	// Ровно демо-набор, а не весь банк: в этом и смысл ограничения.
	if resp.Size != 15 || len(resp.Questions) != 15 {
		t.Fatalf("size=%d, вопросов=%d, ждали 15", resp.Size, len(resp.Questions))
	}
	for _, q := range resp.Questions {
		if q.ID == "" || len(q.Options) < 2 || len(q.Correct) == 0 || q.Conspect == "" {
			t.Errorf("демо-вопрос неполный: %+v", q)
		}
	}
	if cc := rec.Header().Get("Cache-Control"); cc == "" {
		t.Error("у публичного демо нет Cache-Control")
	}
}

func TestDemoNotAvailable(t *testing.T) {
	h := demoMux(t, 1000)
	for _, path := range []string{"/api/demo/M150?lang=ru", "/api/demo/GOSSLUZHBA?lang=kk", "/api/demo/NOPE"} {
		if rec := getDemo(h, path); rec.Code != 404 {
			t.Errorf("%s: %d, ждали 404", path, rec.Code)
		}
	}
	if rec := getDemo(h, "/api/demo/bad%20code"); rec.Code != 400 {
		t.Errorf("кривой код: %d, ждали 400", rec.Code)
	}
}

func TestDemoRateLimited(t *testing.T) {
	h := demoMux(t, 2)
	for i := 0; i < 2; i++ {
		if rec := getDemo(h, "/api/demo/GOSSLUZHBA"); rec.Code != 200 {
			t.Fatalf("запрос %d: %d", i, rec.Code)
		}
	}
	if rec := getDemo(h, "/api/demo/GOSSLUZHBA"); rec.Code != 429 {
		t.Errorf("превышение лимита: %d, ждали 429", rec.Code)
	}
}
