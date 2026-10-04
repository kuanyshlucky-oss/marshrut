package content

import (
	"encoding/json"
	"testing"
)

func load(t *testing.T) *Service {
	t.Helper()
	s, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestLoadAllBanks(t *testing.T) {
	s := load(t)
	if len(s.Infos()) == 0 {
		t.Fatal("профильный контент не найден")
	}
	for _, id := range []string{BankLangListening, BankLangGrammar, BankLangReading, BankLogic} {
		b, ok := s.Bank(id)
		if !ok || len(b.Questions) == 0 {
			t.Errorf("общий банк %s пуст или отсутствует", id)
		}
	}
	for _, info := range s.Infos() {
		for _, subj := range []string{"subj1", "subj2"} {
			b, ok := s.ProfileBank(info.Code, info.Language, subj)
			if !ok || len(b.Questions) == 0 {
				t.Errorf("%s/%s/%s: пустой банк", info.Code, info.Language, subj)
			}
		}
		if !s.Has(info.Code, info.Language) {
			t.Errorf("%s/%s: Has = false", info.Code, info.Language)
		}
	}
}

// Каждый вопрос каждого банка должен быть проверяемым: верные варианты в
// диапазоне, без повторов, у вопросов есть текст.
func TestEveryQuestionIsGradable(t *testing.T) {
	s := load(t)
	n := 0
	for id, b := range s.banks {
		for i, q := range b.Questions {
			n++
			if q.Q == "" && !q.ImageReplacesText {
				t.Errorf("%s[%d]: пустой текст вопроса", id, i)
			}
			if len(q.Options) < 2 {
				t.Errorf("%s[%d]: вариантов %d", id, i, len(q.Options))
			}
			if len(q.Correct) == 0 {
				t.Errorf("%s[%d]: нет верных вариантов", id, i)
			}
			seen := map[int]bool{}
			for _, c := range q.Correct {
				if c < 0 || c >= len(q.Options) || seen[c] {
					t.Errorf("%s[%d]: некорректный верный вариант %v", id, i, q.Correct)
				}
				seen[c] = true
			}
			if q.Multi != (len(q.CorrectRaw) > 0 && q.CorrectRaw[0] == '[') {
				t.Errorf("%s[%d]: Multi не совпадает с формой correct", id, i)
			}
			if q.FP == "" {
				t.Errorf("%s[%d]: нет отпечатка", id, i)
			}
		}
	}
	if n < 1500 {
		t.Errorf("проверено только %d вопросов — контент потерян?", n)
	}
}

func TestProfileBankFallsBackToFlat(t *testing.T) {
	s := load(t)
	// у 7M02 нет разбивки по предметам — обе секции берут общий список
	b1, ok1 := s.ProfileBank("7M02", "ru", "subj1")
	b2, ok2 := s.ProfileBank("7M02", "ru", "subj2")
	if !ok1 || !ok2 || b1 != b2 {
		t.Error("без bySubject обе секции должны отдавать общий список")
	}
	// у 7M01 предметы разные
	a, _ := s.ProfileBank("7M01", "ru", "subj1")
	b, _ := s.ProfileBank("7M01", "ru", "subj2")
	if a == b || a.ID == b.ID {
		t.Error("у 7M01 subj1 и subj2 должны быть разными банками")
	}
	if _, ok := s.ProfileBank("NOPE", "ru", "subj1"); ok {
		t.Error("несуществующее направление найдено")
	}
	if _, ok := s.ProfileBank("7M01", "de", "subj1"); ok {
		t.Error("несуществующий язык найден")
	}
}

func TestFingerprintsAreStableAndDistinguishQuestions(t *testing.T) {
	s1, s2 := load(t), load(t)
	b1, _ := s1.Bank(BankLogic)
	b2, _ := s2.Bank(BankLogic)
	for i := range b1.Questions {
		if b1.Questions[i].FP != b2.Questions[i].FP {
			t.Fatalf("отпечаток нестабилен: %d", i)
		}
	}
	distinct := map[string]bool{}
	for _, q := range b1.Questions {
		distinct[q.FP] = true
	}
	if len(distinct) < len(b1.Questions)*9/10 {
		t.Errorf("слишком много совпадающих отпечатков: %d из %d", len(distinct), len(b1.Questions))
	}
}

func TestNewQuestionValidation(t *testing.T) {
	ok := rawQuestion{Q: "q", Options: []string{"a", "b"}, Correct: json.RawMessage(`1`)}
	if q, err := newQuestion(ok); err != nil || q.Multi || q.Correct[0] != 1 {
		t.Errorf("одиночный: %+v %v", q, err)
	}
	multi := rawQuestion{Q: "q", Options: []string{"a", "b", "c"}, Correct: json.RawMessage(`[0,2]`)}
	if q, err := newQuestion(multi); err != nil || !q.Multi || len(q.Correct) != 2 {
		t.Errorf("множественный: %+v %v", q, err)
	}
	single := rawQuestion{Q: "q", Options: []string{"a", "b"}, Correct: json.RawMessage(`[1]`)}
	if q, err := newQuestion(single); err != nil || !q.Multi {
		t.Errorf("массив из одного элемента остаётся Multi: %+v %v", q, err)
	}
	for name, bad := range map[string]rawQuestion{
		"вне диапазона": {Q: "q", Options: []string{"a"}, Correct: json.RawMessage(`5`)},
		"без вариантов": {Q: "q", Correct: json.RawMessage(`0`)},
		"без correct":   {Q: "q", Options: []string{"a"}},
		"мусор":         {Q: "q", Options: []string{"a"}, Correct: json.RawMessage(`"x"`)},
	} {
		if _, err := newQuestion(bad); err == nil {
			t.Errorf("%s: ожидалась ошибка", name)
		}
	}
}

func TestInfosHideStubs(t *testing.T) {
	s := load(t)
	for _, info := range s.Infos() {
		if info.Code == "7M02" {
			t.Error("заглушка 7M02 (4 вопроса) не должна попадать в админку")
		}
		if info.Title == "" {
			t.Errorf("%s/%s без заголовка", info.Code, info.Language)
		}
	}
}
