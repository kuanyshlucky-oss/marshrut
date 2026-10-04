//go:build integration

package httpapi

import (
	"encoding/json"
	"strings"
	"sync"
	"testing"

	"marshrut-api/internal/content"
	"marshrut-api/internal/exam"
)

// grant выдаёт пользователю доступ к профильному тесту.
func (e *env) grant(uid int64, code, lang string) {
	e.t.Helper()
	if c, _ := e.json("POST", "/api/admin/grant-access", map[string]any{"user_id": uid, "code": code, "language": lang}, admin()); c != 200 {
		e.t.Fatalf("grant-access %s/%s: %d", code, lang, c)
	}
}

// attempt — созданная попытка.
type attempt struct {
	ID           string           `json:"id"`
	Kind         string           `json:"kind"`
	Title        string           `json:"title"`
	LimitSeconds int              `json:"limitSeconds"`
	Questions    []map[string]any `json:"questions"`
}

func (e *env) newAttempt(tok string, body map[string]any) (int, attempt, []byte) {
	e.t.Helper()
	code, _, raw := e.do("POST", "/api/attempts", body, bearer(tok))
	var a attempt
	_ = json.Unmarshal(raw, &a)
	return code, a, raw
}

func (e *env) mustAttempt(tok string, body map[string]any) attempt {
	e.t.Helper()
	code, a, raw := e.newAttempt(tok, body)
	if code != 200 {
		e.t.Fatalf("POST /api/attempts %v: %d %s", body, code, raw)
	}
	return a
}

// answersFor читает ссылки попытки из БД и возвращает ответы: perfect — все верные,
// иначе — заведомо неверные (или пустые, если верных вариантов нет вариантов «мимо»).
func (e *env) answersFor(id string, perfect bool) ([]any, []exam.Ref) {
	e.t.Helper()
	var items []byte
	if err := e.st.DB().QueryRow(`SELECT items FROM attempts WHERE id = $1`, id).Scan(&items); err != nil {
		e.t.Fatal(err)
	}
	var refs []exam.Ref
	if err := json.Unmarshal(items, &refs); err != nil {
		e.t.Fatal(err)
	}
	svc, _ := content.Load()
	qs, err := exam.Resolve(svc, refs)
	if err != nil {
		e.t.Fatal(err)
	}
	out := make([]any, len(qs))
	for i, q := range qs {
		switch {
		case perfect && q.Multi:
			out[i] = q.Correct
		case perfect:
			out[i] = q.Correct[0]
		default:
			wrong := -1
			for o := range q.Options {
				bad := true
				for _, c := range q.Correct {
					if c == o {
						bad = false
					}
				}
				if bad {
					wrong = o
					break
				}
			}
			switch {
			case wrong < 0:
				out[i] = nil
			case q.Multi:
				out[i] = []int{wrong}
			default:
				out[i] = wrong
			}
		}
	}
	return out, refs
}

func (e *env) submit(tok, id string, answers any) (int, map[string]any) {
	e.t.Helper()
	return e.json("POST", "/api/attempts/"+id+"/submit", map[string]any{"answers": answers}, bearer(tok))
}

/* ---------- Ключи не утекают до сдачи ---------- */

func TestAttemptNeverLeaksKeysBeforeSubmit(t *testing.T) {
	e := newEnv(t)
	uid, email, pw := e.mkUser("Leak")
	e.grant(uid, "7M01", "ru")
	tok := e.mustLogin(email, pw)
	svc, _ := content.Load()

	bodies := []map[string]any{
		{"kind": "subject", "code": "7M01", "section": "subj1", "contentLang": "ru"},
		{"kind": "subject", "code": "7M01", "section": "logic"},
		{"kind": "subject", "code": "7M01", "section": "lang"},
		{"kind": "kt:nauchped", "code": "7M01", "lang": "en", "contentLang": "ru"},
		{"kind": "kt:profile", "code": "7M01", "lang": "en", "contentLang": "ru"},
	}
	for _, body := range bodies {
		code, a, raw := e.newAttempt(tok, body)
		if code != 200 || len(a.Questions) == 0 {
			t.Fatalf("%v: %d", body, code)
		}
		// 1. в ответе нет ни одного ключа
		for i, q := range a.Questions {
			for _, k := range []string{"correct", "explanations", "why", "conspect", "conspectImage", "topic"} {
				if _, has := q[k]; has {
					t.Fatalf("%v: вопрос %d содержит %q", body, i, k)
				}
			}
		}
		// 2. текст пояснений и конспектов не просочился ни в каком виде
		text := string(raw)
		var refs []exam.Ref
		var items []byte
		e.st.DB().QueryRow(`SELECT items FROM attempts WHERE id = $1`, a.ID).Scan(&items)
		json.Unmarshal(items, &refs)
		qs, _ := exam.Resolve(svc, refs)
		for _, q := range qs {
			for _, ex := range q.Explanations {
				if len([]rune(ex)) > 25 && strings.Contains(text, strings.ReplaceAll(string([]rune(ex)[:25]), `"`, `\"`)) {
					t.Fatalf("%v: текст объяснения утёк: %q", body, string([]rune(ex)[:25]))
				}
			}
			// конспект часто начинается с формулировки самого вопроса (она публична), поэтому
			// берём фрагмент из середины
			if r := []rune(q.Conspect); len(r) > 160 {
				frag := string(r[100:140])
				if !strings.Contains(q.Q, frag) && strings.Contains(text, strings.ReplaceAll(frag, `"`, `\"`)) {
					t.Fatalf("%v: конспект утёк: %q", body, frag)
				}
			}
		}
		// 3. в БД попытка хранит только ссылки, без ключей
		var stored string
		e.st.DB().QueryRow(`SELECT items::text FROM attempts WHERE id = $1`, a.ID).Scan(&stored)
		if strings.Contains(stored, "correct") {
			t.Fatalf("items попытки содержит ключи: %.100s", stored)
		}
	}
}

func TestReviewBlockedUntilSubmitted(t *testing.T) {
	e := newEnv(t)
	_, email, pw := e.mkUser("Peek")
	tok := e.mustLogin(email, pw)
	a := e.mustAttempt(tok, map[string]any{"kind": "subject", "code": "7M01", "section": "logic"})
	code, _, raw := e.do("GET", "/api/attempts/"+a.ID+"/review", nil, bearer(tok))
	if code != 409 {
		t.Fatalf("разбор до сдачи: %d, want 409", code)
	}
	if strings.Contains(string(raw), "correct") || strings.Contains(string(raw), "explanations") {
		t.Errorf("отказ содержит ключи: %s", raw)
	}
}

/* ---------- Честная проверка: клиент не может назначить себе балл ---------- */

func TestScoreIsComputedByServer(t *testing.T) {
	e := newEnv(t)
	_, email, pw := e.mkUser("Honest")
	tok := e.mustLogin(email, pw)

	// идеальные ответы → полный балл, «сдал»
	a := e.mustAttempt(tok, map[string]any{"kind": "subject", "code": "7M01", "section": "logic"})
	perfect, _ := e.answersFor(a.ID, true)
	code, m := e.submit(tok, a.ID, perfect)
	res := m["result"].(map[string]any)
	if code != 200 || res["score"].(float64) != res["total"].(float64) || res["passed"] != true || res["total"].(float64) != 50 {
		t.Fatalf("идеальная сдача: %d %v", code, res)
	}

	// заведомо неверные → 0, «не сдал»
	b := e.mustAttempt(tok, map[string]any{"kind": "subject", "code": "7M01", "section": "logic"})
	wrong, _ := e.answersFor(b.ID, false)
	code, m = e.submit(tok, b.ID, wrong)
	res = m["result"].(map[string]any)
	if code != 200 || res["score"].(float64) != 0 || res["passed"] != false {
		t.Fatalf("неверная сдача: %d %v", code, res)
	}

	// пустые ответы → 0
	c := e.mustAttempt(tok, map[string]any{"kind": "subject", "code": "7M01", "section": "logic"})
	code, m = e.submit(tok, c.ID, make([]any, len(c.Questions)))
	if code != 200 || m["result"].(map[string]any)["score"].(float64) != 0 {
		t.Fatalf("пустая сдача: %d", code)
	}

	// в кабинете три результата с привязкой к попыткам и серверными вердиктами
	_, me := e.json("GET", "/api/me", nil, bearer(tok))
	results := me["results"].([]any)
	if len(results) != 3 {
		t.Fatalf("результатов %d, want 3", len(results))
	}
	first := results[0].(map[string]any)
	if first["attemptId"] != a.ID || first["passed"] != true || first["kind"] != "subject" || first["section"] != "logic" {
		t.Errorf("результат: %v", first)
	}
	// статистика по темам считается на сервере, клиент её не присылает
	if ts, _ := me["topicStats"].([]any); len(ts) == 0 {
		t.Error("статистика по темам не посчитана")
	}
}

func TestClientCannotForgeResults(t *testing.T) {
	e := newEnv(t)
	_, email, pw := e.mkUser("Forger")
	tok := e.mustLogin(email, pw)
	// старая точка сохранения результатов, принимавшая score/passed от клиента, удалена
	for _, m := range []string{"POST", "PUT", "GET"} {
		code, _, _ := e.do(m, "/api/results", map[string]any{"code": "7M01", "score": 130, "total": 130, "passed": true}, bearer(tok))
		if code == 200 {
			t.Fatalf("%s /api/results ответил 200", m)
		}
	}
	// и старая выдача банка целиком (с ключами) тоже удалена
	if code, _, _ := e.do("GET", "/api/tests/7M01?lang=ru", nil, bearer(tok)); code == 200 {
		t.Fatal("GET /api/tests/{code} всё ещё отдаёт банк с ключами")
	}
	// лишние поля в теле сдачи игнорируются: score/passed от клиента ни на что не влияют
	a := e.mustAttempt(tok, map[string]any{"kind": "subject", "code": "7M01", "section": "logic"})
	wrong, _ := e.answersFor(a.ID, false)
	code, m := e.json("POST", "/api/attempts/"+a.ID+"/submit",
		map[string]any{"answers": wrong, "score": 50, "total": 50, "passed": true}, bearer(tok))
	res := m["result"].(map[string]any)
	if code != 200 || res["score"].(float64) != 0 || res["passed"] != false {
		t.Errorf("серверный итог подменён клиентом: %v", res)
	}
}

func TestSubmitValidation(t *testing.T) {
	e := newEnv(t)
	_, email, pw := e.mkUser("Valid2")
	tok := e.mustLogin(email, pw)
	a := e.mustAttempt(tok, map[string]any{"kind": "subject", "code": "7M01", "section": "logic"})
	n := len(a.Questions)

	bad := map[string]any{
		"мало ответов":        make([]any, n-1),
		"много ответов":       make([]any, n+1),
		"не массив":           "строка",
		"индекс вне":          append(make([]any, n-1), 99),
		"отрицательный":       append(make([]any, n-1), -1),
		"повтор в массиве":    append(make([]any, n-1), []int{1, 1}),
		"дробный":             append(make([]any, n-1), 1.5),
		"объект вместо числа": append(make([]any, n-1), map[string]int{"a": 1}),
		"строка вместо числа": append(make([]any, n-1), "1"),
	}
	for name, ans := range bad {
		if code, _ := e.submit(tok, a.ID, ans); code != 400 {
			t.Errorf("%s: %d, want 400", name, code)
		}
	}
	// после всех отказов попытку по-прежнему можно сдать корректно
	if code, _ := e.submit(tok, a.ID, make([]any, n)); code != 200 {
		t.Errorf("корректная сдача после отказов: %d", code)
	}
	if code, _ := e.json("POST", "/api/attempts/"+a.ID+"/submit", map[string]any{}, bearer(tok)); code != 200 && code != 400 {
		t.Errorf("тело без answers: %d", code)
	}
	if code, _ := e.json("POST", "/api/attempts/not-an-id/submit", map[string]any{"answers": []any{}}, bearer(tok)); code != 404 {
		t.Errorf("некорректный id: %d, want 404", code)
	}
}

func TestSubmitIsIdempotentOverHTTP(t *testing.T) {
	e := newEnv(t)
	_, email, pw := e.mkUser("Twice")
	tok := e.mustLogin(email, pw)
	a := e.mustAttempt(tok, map[string]any{"kind": "subject", "code": "7M01", "section": "logic"})
	perfect, _ := e.answersFor(a.ID, true)
	_, first := e.submit(tok, a.ID, perfect)
	// повторная сдача (потерялся ответ сети) с ДРУГИМИ ответами: итог прежний, ничего не пишется заново
	code, second := e.submit(tok, a.ID, make([]any, len(a.Questions)))
	if code != 200 || second["result"].(map[string]any)["score"] != first["result"].(map[string]any)["score"] {
		t.Fatalf("повторная сдача изменила итог: %d %v", code, second["result"])
	}
	_, me := e.json("GET", "/api/me", nil, bearer(tok))
	if n := len(me["results"].([]any)); n != 1 {
		t.Errorf("результатов %d, want 1", n)
	}
}

func TestConcurrentDoubleSubmit(t *testing.T) {
	e := newEnv(t)
	_, email, pw := e.mkUser("Dbl")
	tok := e.mustLogin(email, pw)
	a := e.mustAttempt(tok, map[string]any{"kind": "subject", "code": "7M01", "section": "logic"})
	perfect, _ := e.answersFor(a.ID, true)
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if code, _ := e.submit(tok, a.ID, perfect); code != 200 {
				t.Errorf("параллельная сдача: %d", code)
			}
		}()
	}
	wg.Wait()
	_, me := e.json("GET", "/api/me", nil, bearer(tok))
	if n := len(me["results"].([]any)); n != 1 {
		t.Errorf("результатов %d, want 1", n)
	}
	for _, ts := range me["topicStats"].([]any) {
		c := ts.(map[string]any)
		if c["correct"].(float64)+c["wrong"].(float64) > 50 {
			t.Errorf("статистика удвоена: %v", c)
		}
	}
}

/* ---------- Доступ, владелец, срок, обновление контента ---------- */

func TestAttemptAccessControl(t *testing.T) {
	e := newEnv(t)
	uid, email, pw := e.mkUser("Acc")
	tok := e.mustLogin(email, pw)

	// без доступа: профильные предметы и КТ закрыты…
	for _, body := range []map[string]any{
		{"kind": "subject", "code": "7M01", "section": "subj1", "contentLang": "ru"},
		{"kind": "subject", "code": "7M01", "section": "subj2", "contentLang": "ru"},
		{"kind": "kt:nauchped", "code": "7M01", "lang": "en", "contentLang": "ru"},
		{"kind": "kt:profile", "code": "7M01", "lang": "en", "contentLang": "ru"},
	} {
		if code, _, _ := e.newAttempt(tok, body); code != 403 {
			t.Errorf("%v без доступа: %d, want 403", body, code)
		}
	}
	// …а английский и ТГО открыты любому вошедшему
	for _, section := range []string{"lang", "logic"} {
		if code, _, _ := e.newAttempt(tok, map[string]any{"kind": "subject", "code": "7M01", "section": section}); code != 200 {
			t.Errorf("%s без доступа: %d, want 200", section, code)
		}
	}
	// без токена — 401
	if code, _ := e.json("POST", "/api/attempts", map[string]any{"kind": "subject", "code": "7M01", "section": "logic"}); code != 401 {
		t.Errorf("без токена: %d", code)
	}

	// доступ на ru не даёт доступ на kk
	e.grant(uid, "7M01", "ru")
	if code, _, _ := e.newAttempt(tok, map[string]any{"kind": "subject", "code": "7M01", "section": "subj1", "contentLang": "ru"}); code != 200 {
		t.Errorf("с доступом ru: %d", code)
	}
	if code, _, _ := e.newAttempt(tok, map[string]any{"kind": "subject", "code": "7M01", "section": "subj1", "contentLang": "kk"}); code != 403 {
		t.Errorf("kk без доступа: %d, want 403", code)
	}
	// отзыв доступа закрывает создание новых попыток
	e.json("POST", "/api/admin/revoke-access", map[string]any{"user_id": uid, "code": "7M01", "language": "ru"}, admin())
	if code, _, _ := e.newAttempt(tok, map[string]any{"kind": "subject", "code": "7M01", "section": "subj1", "contentLang": "ru"}); code != 403 {
		t.Errorf("после отзыва: %d, want 403", code)
	}
}

func TestAttemptParameterValidation(t *testing.T) {
	e := newEnv(t)
	uid, email, pw := e.mkUser("Params")
	e.grant(uid, "7M01", "ru")
	tok := e.mustLogin(email, pw)
	cases := map[string]struct {
		body map[string]any
		want int
	}{
		"чужой kind":         {map[string]any{"kind": "kt:hack", "code": "7M01"}, 400},
		"пустой kind":        {map[string]any{"code": "7M01"}, 400},
		"плохой код":         {map[string]any{"kind": "subject", "code": "a b", "section": "logic"}, 400},
		"неизвестный раздел": {map[string]any{"kind": "subject", "code": "7M01", "section": "history"}, 400},
		"язык КТ":            {map[string]any{"kind": "kt:profile", "code": "7M01", "lang": "de", "contentLang": "ru"}, 400},
		"нет контента":       {map[string]any{"kind": "subject", "code": "NOPE1", "section": "logic"}, 200}, // общий предмет от кода не зависит
	}
	for name, c := range cases {
		if code, _, _ := e.newAttempt(tok, c.body); code != c.want {
			t.Errorf("%s: %d, want %d", name, code, c.want)
		}
	}
}

func TestAttemptOwnership(t *testing.T) {
	e := newEnv(t)
	_, e1, p1 := e.mkUser("Owner")
	_, e2, p2 := e.mkUser("Thief")
	t1, t2 := e.mustLogin(e1, p1), e.mustLogin(e2, p2)
	a := e.mustAttempt(t1, map[string]any{"kind": "subject", "code": "7M01", "section": "logic"})
	perfect, _ := e.answersFor(a.ID, true)

	if code, _ := e.submit(t2, a.ID, perfect); code != 404 {
		t.Errorf("сдача чужой попытки: %d, want 404", code)
	}
	if code, _ := e.json("GET", "/api/attempts/"+a.ID+"/review", nil, bearer(t2)); code != 404 {
		t.Errorf("разбор чужой попытки до сдачи: %d, want 404", code)
	}
	e.submit(t1, a.ID, perfect)
	if code, _, raw := e.do("GET", "/api/attempts/"+a.ID+"/review", nil, bearer(t2)); code != 404 || strings.Contains(string(raw), "correct") {
		t.Errorf("разбор чужой сданной попытки: %d", code)
	}
	if code, _ := e.json("GET", "/api/attempts/"+a.ID+"/review", nil, bearer(t1)); code != 200 {
		t.Errorf("разбор своей: %d", code)
	}
}

func TestAttemptExpiry(t *testing.T) {
	e := newEnv(t)
	_, email, pw := e.mkUser("Late")
	tok := e.mustLogin(email, pw)
	a := e.mustAttempt(tok, map[string]any{"kind": "subject", "code": "7M01", "section": "logic"})
	e.st.DB().Exec(`UPDATE attempts SET expires_at = now() - interval '1 second' WHERE id = $1`, a.ID)
	if code, _ := e.submit(tok, a.ID, make([]any, len(a.Questions))); code != 410 {
		t.Errorf("просроченная сдача: %d, want 410", code)
	}
	_, me := e.json("GET", "/api/me", nil, bearer(tok))
	if n := len(me["results"].([]any)); n != 0 {
		t.Errorf("результат записан по просроченной попытке: %d", n)
	}
}

func TestStaleContentDoesNotGradeWrongQuestions(t *testing.T) {
	e := newEnv(t)
	_, email, pw := e.mkUser("Stale")
	tok := e.mustLogin(email, pw)
	a := e.mustAttempt(tok, map[string]any{"kind": "subject", "code": "7M01", "section": "logic"})
	// имитируем деплой, после которого банк изменился: у первой ссылки другой отпечаток
	e.st.DB().Exec(`UPDATE attempts SET items = jsonb_set(items, '{0,f}', '"00000000"') WHERE id = $1`, a.ID)
	if code, _ := e.submit(tok, a.ID, make([]any, len(a.Questions))); code != 409 {
		t.Errorf("устаревший тест: %d, want 409", code)
	}
	_, me := e.json("GET", "/api/me", nil, bearer(tok))
	if n := len(me["results"].([]any)); n != 0 {
		t.Errorf("результат записан по устаревшему тесту: %d", n)
	}
}

func TestAttemptHourlyLimitOverHTTP(t *testing.T) {
	e := newEnv(t)
	_, email, pw := e.mkUser("Spam")
	tok := e.mustLogin(email, pw)
	body := map[string]any{"kind": "subject", "code": "7M01", "section": "logic"}
	for i := 0; i < 40; i++ {
		if code, _, _ := e.newAttempt(tok, body); code != 200 {
			t.Fatalf("попытка %d: %d", i, code)
		}
	}
	if code, _, _ := e.newAttempt(tok, body); code != 429 {
		t.Errorf("41-я попытка за час: %d, want 429", code)
	}
}

/* ---------- Симуляция КТ ---------- */

func TestKTSimulationEndToEnd(t *testing.T) {
	e := newEnv(t)
	uid, email, pw := e.mkUser("Sim")
	e.grant(uid, "7M01", "ru")
	tok := e.mustLogin(email, pw)

	a := e.mustAttempt(tok, map[string]any{"kind": "kt:nauchped", "code": "7M01", "lang": "en", "contentLang": "ru"})
	if len(a.Questions) != 130 || a.LimitSeconds != 210*60 {
		t.Fatalf("КТ: %d вопросов, лимит %d с", len(a.Questions), a.LimitSeconds)
	}
	blocks := map[string]int{}
	stages := map[string]int{}
	for _, q := range a.Questions {
		blocks[q["block"].(string)]++
		if s, _ := q["stage"].(string); s != "" {
			stages[s]++
		}
	}
	if blocks["lang"] != 50 || blocks["logic"] != 30 || blocks["subj1"] != 30 || blocks["subj2"] != 20 {
		t.Errorf("блоки: %v", blocks)
	}
	if stages["listening"] != 16 || stages["grammar"] != 18 || stages["reading"] != 16 {
		t.Errorf("английский: %v", stages)
	}

	// идеальные ответы → сдал; все блоки выше минимумов
	perfect, _ := e.answersFor(a.ID, true)
	code, m := e.submit(tok, a.ID, perfect)
	res := m["result"].(map[string]any)
	if code != 200 || res["passed"] != true || res["score"].(float64) != 130 || res["thresholdTotal"].(float64) != 75 {
		t.Fatalf("идеальная КТ: %d %v", code, res)
	}
	for _, b := range res["blocks"].([]any) {
		bm := b.(map[string]any)
		if bm["ok"] != true || bm["min"] == nil {
			t.Errorf("блок %v", bm)
		}
	}
	// в разборе — ключи всех 130 вопросов
	review := m["review"].([]any)
	if len(review) != 130 || review[0].(map[string]any)["correct"] == nil {
		t.Errorf("разбор: %d элементов", len(review))
	}

	// «не сдал» по минимуму блока: хороший общий балл при 0 в английском
	b := e.mustAttempt(tok, map[string]any{"kind": "kt:nauchped", "code": "7M01", "lang": "en", "contentLang": "ru"})
	ans, _ := e.answersFor(b.ID, true)
	for i, q := range b.Questions {
		if q["block"] == "lang" {
			ans[i] = nil
		}
	}
	_, m = e.submit(tok, b.ID, ans)
	res = m["result"].(map[string]any)
	if res["passed"] != false || res["score"].(float64) != 80 { // 130 - 50 английских
		t.Errorf("общая сумма 80 ≥ 75, но английский 0 < 25 → не сдал: %v", res)
	}

	// в кабинете два КТ-результата с серверным вердиктом
	_, me := e.json("GET", "/api/me", nil, bearer(tok))
	rs := me["results"].([]any)
	if len(rs) != 2 || rs[0].(map[string]any)["kind"] != "kt:nauchped" || rs[0].(map[string]any)["passed"] != true || rs[1].(map[string]any)["passed"] != false {
		t.Errorf("результаты КТ: %v", rs)
	}
}

/* ---------- Разбор в кабинете ---------- */

func TestReviewAfterSubmit(t *testing.T) {
	e := newEnv(t)
	uid, email, pw := e.mkUser("Rev")
	e.grant(uid, "M107", "ru")
	tok := e.mustLogin(email, pw)
	a := e.mustAttempt(tok, map[string]any{"kind": "subject", "code": "M107", "section": "subj2", "contentLang": "ru"})
	answers, _ := e.answersFor(a.ID, true)
	e.submit(tok, a.ID, answers)

	code, m := e.json("GET", "/api/attempts/"+a.ID+"/review", nil, bearer(tok))
	if code != 200 {
		t.Fatalf("review: %d", code)
	}
	qs, rv, ans := m["questions"].([]any), m["review"].([]any), m["answers"].([]any)
	if len(qs) != len(rv) || len(rv) != len(ans) || len(qs) == 0 {
		t.Fatalf("длины: %d %d %d", len(qs), len(rv), len(ans))
	}
	res := m["result"].(map[string]any)
	if res["passed"] != true || res["score"].(float64) != res["total"].(float64) {
		t.Errorf("итог разбора: %v", res)
	}
	// у предмета с частичным баллом за множественный выбор максимум — 2, поэтому total ≥ числа вопросов
	if res["total"].(float64) < float64(len(qs)) {
		t.Errorf("total %v < вопросов %d", res["total"], len(qs))
	}
	// форма correct сохранена: у multi-вопросов массив
	for i, q := range qs {
		multi := q.(map[string]any)["multi"] == true
		_, isArr := rv[i].(map[string]any)["correct"].([]any)
		if isArr && !multi {
			t.Fatalf("вопрос %d: correct-массив при multi=false", i)
		}
	}
}

/* ---------- Нагрузка ---------- */

func TestConcurrentAttempts(t *testing.T) {
	e := newEnv(t)
	_, email, pw := e.mkUser("Load2")
	tok := e.mustLogin(email, pw)

	// готовим 30 попыток и сдаём их параллельно вместе с потоком чтений (пул БД — 5 соединений)
	const n = 30
	ids := make([]attempt, n)
	ans := make([][]any, n)
	for i := range ids {
		ids[i] = e.mustAttempt(tok, map[string]any{"kind": "subject", "code": "7M01", "section": "logic"})
		ans[i], _ = e.answersFor(ids[i].ID, true)
	}
	var wg sync.WaitGroup
	var mu sync.Mutex
	failures := 0
	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			var code int
			if i < n {
				code, _ = e.submit(tok, ids[i].ID, ans[i])
			} else {
				code, _ = e.json("GET", "/api/me", nil, bearer(tok))
			}
			if code != 200 {
				mu.Lock()
				failures++
				mu.Unlock()
			}
		}(i)
	}
	wg.Wait()
	if failures != 0 {
		t.Errorf("%d запросов из 200 завершились не 200", failures)
	}
	_, me := e.json("GET", "/api/me", nil, bearer(tok))
	if got := len(me["results"].([]any)); got != n {
		t.Errorf("результатов %d, want %d", got, n)
	}
	var totalHits float64
	for _, ts := range me["topicStats"].([]any) {
		c := ts.(map[string]any)
		totalHits += c["correct"].(float64) + c["wrong"].(float64)
	}
	if totalHits != n*50 {
		t.Errorf("статистика по темам: %v ответов, want %d (потеряны параллельные обновления)", totalHits, n*50)
	}
}
