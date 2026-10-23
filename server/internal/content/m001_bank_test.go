package content

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// Темы банка 7M01 (ГОП M001) должны совпадать с темами «Прогресса подготовки» в кабинете
// (GOP_SUBJECTS.M001 в script.js): по ним считается статистика и ссылки на конспекты.
func TestM001TopicsMatchProgressList(t *testing.T) {
	js, err := os.ReadFile("../../../script.js")
	if err != nil {
		t.Skip("script.js не найден — тест запущен вне репозитория")
	}
	start := strings.Index(string(js), "  M001: [")
	if start < 0 {
		t.Fatal("в script.js нет GOP_SUBJECTS.M001")
	}
	block := string(js)[start:]
	if end := strings.Index(block, "  M123: ["); end > 0 {
		block = block[:end]
	}
	var sections [2][]string // p1, p2
	cur := -1
	for _, line := range strings.Split(block, "\n") {
		switch {
		case strings.Contains(line, "id: 'p1'"):
			cur = 0
		case strings.Contains(line, "id: 'p2'"):
			cur = 1
		}
		if cur < 0 {
			continue
		}
		line = strings.TrimSpace(line)
		if m := regexp.MustCompile(`^'([^']+)'[,\s\]}]*`).FindStringSubmatch(line); m != nil {
			sections[cur] = append(sections[cur], m[1])
		}
	}

	s := load(t)
	numbered := regexp.MustCompile(`^Тема \d+\.\s*`)
	for i, subj := range []string{"subj1", "subj2"} {
		b, ok := s.ProfileBank("7M01", "ru", subj)
		if !ok {
			t.Fatalf("нет банка 7M01/%s", subj)
		}
		want := map[string]bool{}
		for _, topic := range sections[i] {
			want[topic] = true
		}
		if len(want) == 0 {
			t.Fatalf("%s: не удалось прочитать темы из script.js", subj)
		}
		got := map[string]int{}
		for _, q := range b.Questions {
			got[numbered.ReplaceAllString(q.Topic, "")]++
		}
		for topic := range got {
			if !want[topic] {
				t.Errorf("%s: тема вопросов %q отсутствует в списке прогресса кабинета", subj, topic)
			}
		}
		for topic := range want {
			if got[topic] == 0 {
				t.Errorf("%s: по теме %q нет ни одного вопроса", subj, topic)
			}
		}
	}
}

// Каждый вопрос 7M01 обязан иметь конспект и тему; пояснения (если есть) согласованы с ключом.
func TestM001QuestionsHaveConspectAndConsistentExplanations(t *testing.T) {
	s := load(t)
	for _, subj := range []string{"subj1", "subj2"} {
		b, _ := s.ProfileBank("7M01", "ru", subj)
		for i, q := range b.Questions {
			where := subj + "#" + itoa(i) + " «" + short(q.Q) + "»"
			if strings.TrimSpace(q.Conspect) == "" {
				t.Errorf("%s: пустой конспект", where)
			}
			if strings.TrimSpace(q.Topic) == "" {
				t.Errorf("%s: нет темы", where)
			}
			if len(q.Explanations) == 0 {
				continue
			}
			if len(q.Explanations) != len(q.Options) {
				t.Errorf("%s: пояснений %d, вариантов %d", where, len(q.Explanations), len(q.Options))
				continue
			}
			correct := map[int]bool{}
			for _, c := range q.Correct {
				correct[c] = true
			}
			for k, e := range q.Explanations {
				if strings.Contains(e, "перепроверки") || strings.Contains(e, "предыдущей версии") {
					t.Errorf("%s: служебная пометка в пояснении к варианту %d", where, k)
				}
				isRight := strings.HasPrefix(e, "Верно")
				if correct[k] != isRight {
					t.Errorf("%s: пояснение к варианту %d не согласовано с ключом: %.60q", where, k, e)
				}
			}
		}
	}
}

// Одинаковых вопросов (текст + набор вариантов) в одном банке быть не должно.
func TestM001NoExactDuplicateQuestions(t *testing.T) {
	s := load(t)
	for _, subj := range []string{"subj1", "subj2"} {
		b, _ := s.ProfileBank("7M01", "ru", subj)
		seen := map[string]int{}
		for i, q := range b.Questions {
			key := strings.ToLower(strings.TrimSpace(q.Q)) + "\x00" + strings.ToLower(strings.Join(q.Options, "\x00"))
			if j, dup := seen[key]; dup {
				// в источнике есть намеренные пары с разным порядком вариантов, но не с идентичным
				t.Errorf("%s: вопросы %d и %d полностью совпадают: %.60q", subj, j, i, q.Q)
			}
			seen[key] = i
		}
	}
}

func short(s string) string {
	r := []rune(s)
	if len(r) > 50 {
		return string(r[:50])
	}
	return s
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var d []byte
	for ; n > 0; n /= 10 {
		d = append([]byte{byte('0' + n%10)}, d...)
	}
	return string(d)
}
