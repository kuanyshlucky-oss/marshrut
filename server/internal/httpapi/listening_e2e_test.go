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

// Повторная отправка с тем же id прохождения не удваивает результат; кривой id отклоняется.
func TestListeningIdempotentE2E(t *testing.T) {
	e := newEnv(t)
	_, email, pw := e.mkUser("LisIdem")
	tok := e.mustLogin(email, pw)

	body := map[string]any{"id": "9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f", "clip": "nemo-keep-swimming", "score": 80, "phrases": []int{100, 60}}
	for i := 0; i < 3; i++ {
		code, m := e.json("POST", "/api/listening/result", body, bearer(tok))
		if code != 200 {
			t.Fatalf("отправка #%d: %d %v", i+1, code, m)
		}
		c := m["progress"].(map[string]any)["nemo-keep-swimming"].(map[string]any)
		if c["tries"] != float64(1) || c["best"] != float64(80) {
			t.Errorf("после отправки #%d: %v (повтор должен быть идемпотентным)", i+1, c)
		}
	}
	bad := map[string]any{"id": "short", "clip": "nemo-keep-swimming", "score": 80}
	if code, _ := e.json("POST", "/api/listening/result", bad, bearer(tok)); code != 400 {
		t.Errorf("кривой id прохождения принят: %d", code)
	}
}

// Запись результатов ограничена по числу в минуту на пользователя; чтение и другие пользователи не страдают.
func TestListeningRateLimitE2E(t *testing.T) {
	e := newEnv(t)
	_, email1, pw1 := e.mkUser("LisRate1")
	_, email2, pw2 := e.mkUser("LisRate2")
	tok1, tok2 := e.mustLogin(email1, pw1), e.mustLogin(email2, pw2)

	post := func(tok string) int {
		code, _ := e.json("POST", "/api/listening/result", map[string]any{"clip": "nemo-keep-swimming", "score": 50}, bearer(tok))
		return code
	}
	for i := 0; i < listeningRatePerMin; i++ {
		if code := post(tok1); code != 200 {
			t.Fatalf("запись #%d: %d, want 200", i+1, code)
		}
	}
	if code := post(tok1); code != 429 {
		t.Errorf("запись сверх лимита: %d, want 429", code)
	}
	if code, _ := e.json("GET", "/api/listening", nil, bearer(tok1)); code != 200 {
		t.Errorf("чтение при исчерпанном лимите записи: %d, want 200", code)
	}
	if code := post(tok2); code != 200 {
		t.Errorf("лимит одного пользователя задел другого: %d", code)
	}
}
