//go:build integration

package httpapi

import (
	"fmt"
	"strings"
	"testing"

	"marshrut-api/internal/content"
)

// Сквозная проверка ГОП M001 (7M01): после сдачи тестов по обоим профильным предметам в разборе у
// каждого вопроса есть конспект и тема, а «Прогресс подготовки» (topicStats в /api/me) копится по
// темам банка — в том числе для вопросов, добавленных позже.
func TestM001ReviewHasConspectsAndProgressTracksBankTopics(t *testing.T) {
	svc, err := content.Load()
	if err != nil {
		t.Fatal(err)
	}
	e := newEnv(t)
	uid, email, pw := e.mkUser("M001")
	e.grant(uid, "7M01", "ru")
	tok := e.mustLogin(email, pw)

	bankTopics := map[string]bool{}
	for _, subj := range []string{"subj1", "subj2"} {
		b, _ := svc.ProfileBank("7M01", "ru", subj)
		for _, q := range b.Questions {
			bankTopics[q.Topic] = true
		}
	}

	answered := 0
	distinct := map[string]map[string]bool{"subj1": {}, "subj2": {}} // предмет → уникальные вопросы (банк#индекс)
	for _, subj := range []string{"subj1", "subj2"} {
		// несколько попыток на предмет, чтобы пройти по большей части банка
		for i := 0; i < 6; i++ {
			a := e.mustAttempt(tok, map[string]any{"kind": "subject", "code": "7M01", "section": subj, "contentLang": "ru"})
			answers, refs := e.answersFor(a.ID, true)
			for _, r := range refs {
				distinct[subj][fmt.Sprintf("%s#%d", r.Bank, r.Idx)] = true
			}
			if c, _ := e.submit(tok, a.ID, answers); c != 200 {
				t.Fatalf("submit %s: %d", subj, c)
			}
			code, m := e.json("GET", "/api/attempts/"+a.ID+"/review", nil, bearer(tok))
			if code != 200 {
				t.Fatalf("review: %d", code)
			}
			for n, r := range m["review"].([]any) {
				rv := r.(map[string]any)
				if strings.TrimSpace(rv["conspect"].(string)) == "" {
					t.Errorf("%s: в разборе вопроса %d нет конспекта", subj, n)
				}
				topic, _ := rv["topic"].(string)
				if !bankTopics[topic] {
					t.Errorf("%s: тема %q из разбора не принадлежит банку", subj, topic)
				}
				answered++
			}
		}
	}

	_, me := e.json("GET", "/api/me", nil, bearer(tok))
	total, seen := 0, map[string]int{}
	for _, raw := range me["topicStats"].([]any) {
		ts := raw.(map[string]any)
		if ts["code"] != "7M01" {
			continue
		}
		if !bankTopics[ts["topic"].(string)] {
			t.Errorf("в прогрессе тема %q, которой нет в банке", ts["topic"])
		}
		total += int(ts["correct"].(float64)) + int(ts["wrong"].(float64))
		seen[ts["section"].(string)] += int(ts["seen"].(float64))
	}
	if total != answered {
		t.Errorf("в прогрессе %d ответов, дано %d", total, answered)
	}
	// «решали X из N»: X — число разных решённых вопросов, N — размер банка по теме
	for _, subj := range []string{"subj1", "subj2"} {
		if seen[subj] != len(distinct[subj]) {
			t.Errorf("%s: в прогрессе решённых вопросов %d, разных было %d", subj, seen[subj], len(distinct[subj]))
		}
	}
	_, totals := e.json("GET", "/api/topic-totals", nil, bearer(tok))
	for _, subj := range []string{"subj1", "subj2"} {
		b, _ := svc.ProfileBank("7M01", "ru", subj)
		sum := 0
		for _, n := range totals["7M01"].(map[string]any)[subj].(map[string]any) {
			sum += int(n.(float64))
		}
		if sum != len(b.Questions) {
			t.Errorf("%s: в topic-totals %d вопросов, в банке %d", subj, sum, len(b.Questions))
		}
		if seen[subj] > sum {
			t.Errorf("%s: решено %d из %d", subj, seen[subj], sum)
		}
	}
}
