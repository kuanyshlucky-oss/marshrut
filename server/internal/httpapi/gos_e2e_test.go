//go:build integration

package httpapi

import (
	"strconv"
	"testing"
)

// Тест по госслужбе: доступ обязателен, пробный тест — 55 вопросов без ключей, вердикт по правилам 30/55 и ≥5 по акту,
// радио-кнопки во всех актах, журнал использования пишется.
func TestGosMockAttemptEndToEnd(t *testing.T) {
	e := newEnv(t)
	uid, email, pw := e.mkUser("Gos")
	tok := e.mustLogin(email, pw)
	body := map[string]any{"kind": "gos", "code": "GOSSLUZHBA", "section": "mock", "contentLang": "ru"}

	if code, _, _ := e.newAttempt(tok, body); code != 403 {
		t.Fatalf("без доступа: %d, ждали 403", code)
	}
	e.grant(uid, "GOSSLUZHBA", "ru")

	a := e.mustAttempt(tok, body)
	if len(a.Questions) != 55 {
		t.Fatalf("вопросов %d, ждали 55", len(a.Questions))
	}
	perBlock := map[string]int{}
	for i, q := range a.Questions {
		if q["multi"] == true {
			t.Fatalf("вопрос %d: чекбоксы в тесте по госслужбе", i)
		}
		for _, k := range []string{"correct", "conspect", "why", "topic"} {
			if _, has := q[k]; has {
				t.Fatalf("вопрос %d содержит ключ %q до сдачи", i, k)
			}
		}
		perBlock[q["block"].(string)]++
	}
	if perBlock["subj1"] != 14 || perBlock["subj2"] != 14 || perBlock["subj3"] != 14 || perBlock["subj4"] != 13 {
		t.Fatalf("распределение по актам: %v", perBlock)
	}

	perfect, _ := e.answersFor(a.ID, true)
	code, m := e.submit(tok, a.ID, perfect)
	res, _ := m["result"].(map[string]any)
	if code != 200 || res["passed"] != true || res["score"].(float64) != 55 || res["total"].(float64) != 55 || res["thresholdTotal"].(float64) != 30 {
		t.Fatalf("все верно: %d %v", code, m)
	}
	if blocks, _ := res["blocks"].([]any); len(blocks) != 4 {
		t.Fatalf("блоков в итоге: %v", res["blocks"])
	}

	b := e.mustAttempt(tok, body)
	wrong, _ := e.answersFor(b.ID, false)
	code, m = e.submit(tok, b.ID, wrong)
	res, _ = m["result"].(map[string]any)
	if code != 200 || res["passed"] != false {
		t.Fatalf("все неверно: %d %v", code, m)
	}

	// Журнал использования записан для платного теста по госслужбе.
	_, u := e.json("GET", "/api/admin/usage?user_id="+strconv.FormatInt(uid, 10), nil, admin())
	items, _ := u["items"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["used"] != true || items[0].(map[string]any)["attempts"].(float64) != 2 {
		t.Fatalf("журнал: %v", u)
	}
}

func TestGosPracticeAndBadSections(t *testing.T) {
	e := newEnv(t)
	uid, email, pw := e.mkUser("GosPractice")
	tok := e.mustLogin(email, pw)
	e.grant(uid, "GOSSLUZHBA", "ru")

	for _, sec := range []string{"subj1", "subj2", "subj3", "subj4"} {
		a := e.mustAttempt(tok, map[string]any{"kind": "gos", "code": "GOSSLUZHBA", "section": sec, "contentLang": "ru"})
		if len(a.Questions) == 0 || len(a.Questions) > 50 {
			t.Errorf("%s: %d вопросов", sec, len(a.Questions))
		}
		for _, q := range a.Questions {
			if q["multi"] == true {
				t.Fatalf("%s: чекбоксы в тренировке акта", sec)
			}
		}
	}
	for _, c := range []struct {
		body map[string]any
		want int
	}{
		{map[string]any{"kind": "gos", "code": "GOSSLUZHBA", "section": "lang", "contentLang": "ru"}, 400},
		{map[string]any{"kind": "gos", "code": "GOSSLUZHBA", "section": "mock", "contentLang": "kk"}, 403}, // доступа на kk нет
		{map[string]any{"kind": "gos", "code": "M150", "section": "mock", "contentLang": "ru"}, 403},
	} {
		if code, _, _ := e.newAttempt(tok, c.body); code != c.want {
			t.Errorf("%v: %d, ждали %d", c.body, code, c.want)
		}
	}
	// даже с доступом чужой тест не собирается как «госслужба»
	e.grant(uid, "M150", "ru")
	if code, _, _ := e.newAttempt(tok, map[string]any{"kind": "gos", "code": "M150", "section": "mock", "contentLang": "ru"}); code != 404 {
		t.Errorf("gos для M150: %d, ждали 404", code)
	}
}
