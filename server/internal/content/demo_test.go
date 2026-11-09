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
	for _, q := range qs {
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
	if len(perAct) < 4 {
		t.Errorf("демо покрывает не все акты: %v", perAct)
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
