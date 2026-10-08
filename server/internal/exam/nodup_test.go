package exam

import (
	"fmt"
	"slices"
	"strings"
	"testing"
	"unicode"

	"marshrut-api/internal/content"
)

// normText — нижний регистр, «ё»→«е», только буквы и цифры, одинарные пробелы.
func normText(s string) string {
	s = strings.ReplaceAll(strings.ToLower(s), "ё", "е")
	var b strings.Builder
	prevSpace := true
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			prevSpace = false
		} else if !prevSpace {
			b.WriteByte(' ')
			prevSpace = true
		}
	}
	return strings.TrimSpace(b.String())
}

func tokenSet(s string) map[string]bool {
	set := map[string]bool{}
	for _, w := range strings.Fields(normText(s)) {
		if len([]rune(w)) > 2 {
			set[w] = true
		}
	}
	return set
}

func jaccard(a, b map[string]bool) float64 {
	inter := 0
	for w := range a {
		if b[w] {
			inter++
		}
	}
	union := len(a) + len(b) - inter
	if union == 0 {
		return 0
	}
	return float64(inter) / float64(union)
}

func answerKey(q *content.Question) string {
	var parts []string
	for _, c := range q.Correct {
		parts = append(parts, normText(q.Options[c]))
	}
	slices.Sort(parts)
	return strings.Join(parts, "/")
}

func passageKey(q *content.Question) string {
	p := normText(q.Passage)
	if len(p) > 40 {
		p = p[:40]
	}
	return p
}

// В банке M078 не должно быть одинаковых и перефразированных повторов одного вопроса:
// иначе в одном тесте студент увидит «тот же» вопрос дважды.
func TestM078BankHasNoDuplicateQuestions(t *testing.T) {
	s := svc(t)
	for _, subj := range []string{"subj1", "subj2"} {
		b, ok := s.ProfileBank("M078", "ru", subj)
		if !ok || len(b.Questions) == 0 {
			t.Fatalf("M078/%s: банк пуст", subj)
		}
		sets := make([]map[string]bool, len(b.Questions))
		for i, q := range b.Questions {
			sets[i] = tokenSet(q.Q)
		}
		exact := map[string]int{}
		for i, q := range b.Questions {
			opts := make([]string, len(q.Options))
			for k, o := range q.Options {
				opts[k] = normText(o)
			}
			slices.Sort(opts)
			key := passageKey(q) + "|" + normText(q.Q) + "|" + strings.Join(opts, "/")
			if j, dup := exact[key]; dup {
				t.Errorf("M078/%s: точный дубль вопросов %d и %d: %.70s", subj, j, i, q.Q)
			}
			exact[key] = i
		}
		for i := 0; i < len(b.Questions); i++ {
			for j := i + 1; j < len(b.Questions); j++ {
				if passageKey(b.Questions[i]) != passageKey(b.Questions[j]) {
					continue
				}
				sim := jaccard(sets[i], sets[j])
				same := answerKey(b.Questions[i]) == answerKey(b.Questions[j])
				if (same && sim >= 0.5) || sim >= 0.75 {
					t.Errorf("M078/%s: похожие вопросы %d и %d (сходство %.2f, одинаковый ответ: %v): %.60s | %.60s",
						subj, i, j, sim, same, b.Questions[i].Q, b.Questions[j].Q)
				}
			}
		}
	}
}

// В одной собранной попытке (КТ из двух предметов и тест по предмету) ни один вопрос не
// встречается дважды: ни по индексу банка, ни по тексту.
func TestPlansNeverRepeatQuestions(t *testing.T) {
	s := svc(t)
	check := func(name string, p *Plan) {
		seenIdx := map[string]bool{}
		seenText := map[string]bool{}
		qs, err := Resolve(s, p.Refs)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		for i, r := range p.Refs {
			ik := fmt.Sprintf("%s#%d", r.Bank, r.Idx)
			tk := passageKey(qs[i]) + "|" + normText(qs[i].Q)
			if seenIdx[ik] || seenText[tk] {
				t.Fatalf("%s: повтор вопроса в одной попытке (%s): %.70s", name, ik, qs[i].Q)
			}
			seenIdx[ik], seenText[tk] = true, true
		}
	}
	for seed := uint64(1); seed <= 300; seed++ {
		p, err := BuildKT(s, seeded(seed), "profile2", "M078", "ru", "")
		if err != nil {
			t.Fatal(err)
		}
		check(fmt.Sprintf("КТ M078 seed %d", seed), p)
		for _, sec := range []string{"subj1", "subj2"} {
			ps, err := BuildSubject(s, seeded(seed), "M078", "ru", sec)
			if err != nil {
				t.Fatal(err)
			}
			check(fmt.Sprintf("%s M078 seed %d", sec, seed), ps)
		}
	}
}
