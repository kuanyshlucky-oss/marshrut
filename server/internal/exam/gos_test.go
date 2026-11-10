package exam

import (
	"errors"
	"strconv"
	"testing"

	"marshrut-api/internal/content"
)

const gosCode = "GOSSLUZHBA"

func TestBuildGosMock(t *testing.T) {
	s := svc(t)
	p, err := BuildGos(s, seeded(1), gosCode, "ru", GosMock)
	if err != nil {
		t.Fatal(err)
	}
	if p.Kind != KindGos || p.Section != GosMock || len(p.Refs) != 55 || p.Limit != 0 {
		t.Fatalf("план: kind=%s section=%s вопросов=%d limit=%v", p.Kind, p.Section, len(p.Refs), p.Limit)
	}
	perBlock := map[string]int{}
	seen := map[string]bool{}
	for _, r := range p.Refs {
		perBlock[r.Block]++
		if seen[r.Bank+"#"+strconv.Itoa(r.Idx)] {
			t.Errorf("вопрос %s#%d дважды в одной попытке", r.Bank, r.Idx)
		}
		seen[r.Bank+"#"+strconv.Itoa(r.Idx)] = true
	}
	want := map[string]int{"subj1": 14, "subj2": 14, "subj3": 14, "subj4": 13}
	for k, n := range want {
		if perBlock[k] != n {
			t.Errorf("%s: %d вопросов, ждали %d", k, perBlock[k], n)
		}
	}
	// ссылки должны разрешаться в вопросы банка (отпечатки совпадают)
	if _, err := Resolve(s, p.Refs); err != nil {
		t.Fatal(err)
	}
}

func TestBuildGosMockIsRandomAcrossAttempts(t *testing.T) {
	s := svc(t)
	a, _ := BuildGos(s, seeded(1), gosCode, "ru", GosMock)
	b, _ := BuildGos(s, seeded(2), gosCode, "ru", GosMock)
	same := 0
	for i := range a.Refs {
		if a.Refs[i] == b.Refs[i] {
			same++
		}
	}
	if same == len(a.Refs) {
		t.Fatal("две попытки с разным зерном дали одинаковый вариант")
	}
}

func TestBuildGosPracticePerAct(t *testing.T) {
	s := svc(t)
	for _, sec := range []string{"subj1", "subj2", "subj3", "subj4"} {
		p, err := BuildGos(s, seeded(7), gosCode, "ru", sec)
		if err != nil {
			t.Fatalf("%s: %v", sec, err)
		}
		if len(p.Refs) == 0 || len(p.Refs) > QuizMaxQuestions {
			t.Errorf("%s: %d вопросов (макс. %d)", sec, len(p.Refs), QuizMaxQuestions)
		}
		for _, r := range p.Refs {
			if r.Block != sec {
				t.Fatalf("%s: в тренировке акта вопрос из блока %s", sec, r.Block)
			}
		}
	}
	// subj4 — 80 вопросов, но тренировка не длиннее 50
	if p, _ := BuildGos(s, seeded(7), gosCode, "ru", "subj4"); len(p.Refs) != 50 {
		t.Errorf("subj4: %d вопросов, ждали 50", len(p.Refs))
	}
}

func TestBuildGosErrors(t *testing.T) {
	s := svc(t)
	cases := []struct {
		name, code, lang, section string
		want                      error
	}{
		{"неизвестный раздел", gosCode, "ru", "lang", ErrBadSection},
		{"раздел-мусор", gosCode, "ru", "subj5", ErrBadSection},
		{"чужой тест не собирается как госслужба", "M150", "ru", GosMock, ErrNoContent},
		{"нет казахского банка", gosCode, "kk", GosMock, ErrNoContent},
		{"нет казахского банка (акт)", gosCode, "kk", "subj3", ErrNoContent},
	}
	for _, c := range cases {
		if _, err := BuildGos(s, seeded(1), c.code, c.lang, c.section); !errors.Is(err, c.want) {
			t.Errorf("%s: %v, ждали %v", c.name, err, c.want)
		}
	}
}

// gradeWith собирает пробный тест и отвечает верно на первые N вопросов каждого акта (N из correctPerBlock), остальные оставляет пустыми.
func gradeWith(t *testing.T, correctPerBlock map[string]int) *Outcome {
	t.Helper()
	s := svc(t)
	p, err := BuildGos(s, seeded(3), gosCode, "ru", GosMock)
	if err != nil {
		t.Fatal(err)
	}
	qs, err := Resolve(s, p.Refs)
	if err != nil {
		t.Fatal(err)
	}
	given := map[string]int{}
	answers := make([]Answer, len(qs))
	for i, q := range qs {
		blk := p.Refs[i].Block
		if given[blk] < correctPerBlock[blk] {
			answers[i] = Answer{q.Correct[0]}
			given[blk]++
		}
	}
	if err := Validate(qs, answers); err != nil {
		t.Fatal(err)
	}
	o, err := Grade(p, qs, answers)
	if err != nil {
		t.Fatal(err)
	}
	return o
}

func TestGradeGosMock(t *testing.T) {
	cases := []struct {
		name    string
		correct map[string]int
		score   int
		passed  bool
	}{
		{"всё верно", map[string]int{"subj1": 14, "subj2": 14, "subj3": 14, "subj4": 13}, 55, true},
		{"ровно порог, у каждого акта ≥5", map[string]int{"subj1": 8, "subj2": 8, "subj3": 7, "subj4": 7}, 30, true},
		{"на один ниже порога", map[string]int{"subj1": 8, "subj2": 7, "subj3": 7, "subj4": 7}, 29, false},
		{"порог набран, но один акт на 4", map[string]int{"subj1": 14, "subj2": 12, "subj3": 4, "subj4": 13}, 43, false},
		{"минимум по актам набран, общий порог нет", map[string]int{"subj1": 5, "subj2": 5, "subj3": 5, "subj4": 5}, 20, false},
		{"по 5 в трёх актах и все 13 в четвёртом: 28, ниже порога", map[string]int{"subj1": 5, "subj2": 5, "subj3": 5, "subj4": 13}, 28, false},
		{"ничего не отвечено", map[string]int{}, 0, false},
	}
	for _, c := range cases {
		o := gradeWith(t, c.correct)
		if o.Score != c.score || o.Total != 55 || o.Passed != c.passed {
			t.Errorf("%s: score=%d total=%d passed=%v, ждали %d/55/%v", c.name, o.Score, o.Total, o.Passed, c.score, c.passed)
		}
		if o.Threshold != GosThreshold || len(o.Blocks) != 4 {
			t.Errorf("%s: порог=%d блоков=%d", c.name, o.Threshold, len(o.Blocks))
		}
		for _, b := range o.Blocks {
			if b.Min == nil || *b.Min != GosBlockMin || b.OK != (b.Score >= GosBlockMin) {
				t.Errorf("%s: блок %+v", c.name, b)
			}
		}
	}
}

func TestGosUsesRadioButtonsEvenInSecondAct(t *testing.T) {
	s := svc(t)
	p, _ := BuildGos(s, seeded(1), gosCode, "ru", GosMock)
	qs, _ := Resolve(s, p.Refs)
	pub := Public(p, qs)
	for i, q := range pub {
		if q.Multi {
			t.Fatalf("вопрос %d (%s): в тесте по госслужбе нет множественного выбора", i, p.Refs[i].Block)
		}
		if q.Block == "" {
			t.Fatalf("вопрос %d: нет блока (акта)", i)
		}
	}
	// У КТ второй профильный предмет по-прежнему с чекбоксами: это поведение не трогаем.
	if !IsMultiUI(KindSubject, "M150", "subj2", &content.Question{}) {
		t.Error("у КТ subj2 перестал рисоваться чекбоксами")
	}
}

func TestGosPracticeVerdictIsPercent(t *testing.T) {
	s := svc(t)
	p, _ := BuildGos(s, seeded(1), gosCode, "ru", "subj3")
	qs, _ := Resolve(s, p.Refs)
	answers := make([]Answer, len(qs))
	for i, q := range qs {
		answers[i] = Answer{q.Correct[0]}
	}
	o, err := Grade(p, qs, answers)
	if err != nil || !o.Passed || o.Score != len(qs) || len(o.Blocks) != 0 {
		t.Fatalf("все верно в тренировке акта: %+v err=%v", o, err)
	}
}
