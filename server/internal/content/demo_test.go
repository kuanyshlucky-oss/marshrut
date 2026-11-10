package content

import "testing"

func TestDemoQuestions(t *testing.T) {
	s := load(t)
	qs := s.DemoQuestions("GOSSLUZHBA", "ru")
	if len(qs) != DemoSize("GOSSLUZHBA") || len(qs) != 15 {
		t.Fatalf("демо: %d вопросов, ждали 15", len(qs))
	}
	seen := map[string]bool{}
	perAct := map[string]int{}
	perBlock := map[string]int{}
	for _, it := range qs {
		q := it.Q
		perBlock[it.Block]++
		if seen[q.FP] {
			t.Errorf("повтор вопроса в демо: %.40q", q.Q)
		}
		seen[q.FP] = true
		if len(q.Options) < 2 || len(q.Correct) == 0 || q.Conspect == "" {
			t.Errorf("демо-вопрос неполный: %.40q", q.Q)
		}
		perAct[q.Topic[:12]]++
	}
	// 15 вопросов на 4 предмета: 4/4/4/3 — ни один акт не пропущен.
	if len(perAct) < 4 || perBlock["subj1"] != 4 || perBlock["subj2"] != 4 || perBlock["subj3"] != 4 || perBlock["subj4"] != 3 {
		t.Errorf("демо покрывает акты неравномерно: %v (по темам %v)", perBlock, perAct)
	}
	again := s.DemoQuestions("GOSSLUZHBA", "ru")
	for i := range qs {
		if qs[i] != again[i] {
			t.Fatal("выбор демо-вопросов недетерминирован")
		}
	}
}

func TestDemoUnavailable(t *testing.T) {
	s := load(t)
	if DemoSize("M150") != 0 || s.DemoQuestions("M150", "ru") != nil {
		t.Error("демо включилось у теста без настройки")
	}
	if s.DemoQuestions("GOSSLUZHBA", "kk") != nil {
		t.Error("демо отдано для языка без файла банка")
	}
	if s.DemoQuestions("NOPE", "ru") != nil {
		t.Error("демо отдано для несуществующего кода")
	}
}

func TestTopicTotalsFourSubjectsOnlyForGos(t *testing.T) {
	s := load(t)
	if !s.HasSubject("GOSSLUZHBA", "ru", "subj4") || s.HasSubject("GOSSLUZHBA", "kk", "subj1") || s.HasSubject("M150", "ru", "subj3") {
		t.Fatal("HasSubject вернул неверный ответ")
	}
	totals := s.TopicTotals()
	gos := totals["GOSSLUZHBA"]
	for _, subj := range []string{"subj1", "subj2", "subj3", "subj4"} {
		n := 0
		for _, c := range gos[subj] {
			n += c
		}
		if n == 0 {
			t.Errorf("GOSSLUZHBA/%s: нет вопросов с темами для прогресса", subj)
		}
	}
	// У остальных тестов разделов subj3/subj4 быть не должно (иначе общий список размножился бы).
	for code, by := range totals {
		if code == "GOSSLUZHBA" {
			continue
		}
		if _, ok := by["subj3"]; ok {
			t.Errorf("%s: появился лишний раздел subj3", code)
		}
		if _, ok := by["subj4"]; ok {
			t.Errorf("%s: появился лишний раздел subj4", code)
		}
	}
}
