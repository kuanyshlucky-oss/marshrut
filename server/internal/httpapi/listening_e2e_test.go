//go:build integration

package httpapi

import "testing"

// Результаты диктантов Listening: только для вошедшего, у каждого аккаунта свои, лучший не падает, мусор отклоняется.
func TestListeningProgressE2E(t *testing.T) {
	e := newEnv(t)
	_, email1, pw1 := e.mkUser("Lis1")
	_, email2, pw2 := e.mkUser("Lis2")
	tok1, tok2 := e.mustLogin(email1, pw1), e.mustLogin(email2, pw2)

	if code, _ := e.json("GET", "/api/listening", nil); code != 401 {
		t.Errorf("без токена: %d, want 401", code)
	}
	if code, _ := e.json("POST", "/api/listening/result", map[string]any{"clip": "kfp-shifu-1", "score": 50}); code != 401 {
		t.Errorf("запись без токена: %d, want 401", code)
	}

	code, m := e.json("GET", "/api/listening", nil, bearer(tok1))
	if code != 200 || len(m["progress"].(map[string]any)) != 0 {
		t.Fatalf("пустой прогресс: %d %v", code, m)
	}

	for _, sc := range []int{40, 92, 70} {
		code, m = e.json("POST", "/api/listening/result", map[string]any{"clip": "kfp-shifu-1", "score": sc, "phrases": []int{100, sc}}, bearer(tok1))
		if code != 200 {
			t.Fatalf("сохранение %d: %d %v", sc, code, m)
		}
	}
	c := m["progress"].(map[string]any)["kfp-shifu-1"].(map[string]any)
	if c["best"] != float64(92) || c["last"] != float64(70) || c["tries"] != float64(3) {
		t.Errorf("прогресс: %v", c)
	}

	// у второго аккаунта своё
	if _, m2 := e.json("GET", "/api/listening", nil, bearer(tok2)); len(m2["progress"].(map[string]any)) != 0 {
		t.Errorf("чужой прогресс виден: %v", m2)
	}

	// история
	code, h := e.json("GET", "/api/listening/history", nil, bearer(tok1))
	hist, _ := h["history"].([]any)
	if code != 200 || len(hist) != 3 || hist[0].(map[string]any)["score"] != float64(70) {
		t.Errorf("история: %d %v", code, h)
	}

	// некорректное
	bad := []map[string]any{
		{"clip": "", "score": 50},
		{"clip": "BAD CLIP", "score": 50},
		{"clip": "kfp-shifu-1", "score": 101},
		{"clip": "kfp-shifu-1", "score": -1},
		{"clip": "kfp-shifu-1", "score": 50, "phrases": []int{200}},
	}
	for _, b := range bad {
		if code, _ := e.json("POST", "/api/listening/result", b, bearer(tok1)); code != 400 {
			t.Errorf("мусор %v принят: %d", b, code)
		}
	}
	if _, m = e.json("GET", "/api/listening", nil, bearer(tok1)); m["progress"].(map[string]any)["kfp-shifu-1"].(map[string]any)["tries"] != float64(3) {
		t.Errorf("отклонённые попытки попали в базу: %v", m)
	}
}
