package exam

import (
	"encoding/json"
	"math/rand/v2"
	"os"
	"strings"
	"testing"
	"time"

	"marshrut-api/internal/content"
)

func svc(t *testing.T) *content.Service {
	t.Helper()
	s, err := content.Load()
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func seeded(seed uint64) Shuffler { return rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15)) }

func mkQ(t *testing.T, raw string, opts int) *content.Question {
	t.Helper()
	q := &content.Question{} // поля экспортированы — строим напрямую
	var v struct{ Correct json.RawMessage }
	if err := json.Unmarshal([]byte(`{"Correct":`+raw+`}`), &v); err != nil {
		t.Fatal(err)
	}
	q.Options = make([]string, opts)
	q.CorrectRaw = v.Correct
	if len(raw) > 0 && raw[0] == '[' {
		q.Multi = true
		json.Unmarshal(v.Correct, &q.Correct)
	} else {
		var one int
		json.Unmarshal(v.Correct, &one)
		q.Correct = []int{one}
	}
	return q
}

/* ---------- Parity: те же баллы и вердикты, что и в клиентской логике (kt.js) ---------- */

type parityFile struct {
	Questions []struct {
		Correct   json.RawMessage `json:"correct"`
		Answer    json.RawMessage `json:"answer"`
		Code      string          `json:"code"`
		Block     string          `json:"block"`
		IsCorrect bool            `json:"isCorrect"`
		Max       int             `json:"max"`
		Earned    int             `json:"earned"`
	} `json:"questions"`
	Verdicts []struct {
		TypeID   string         `json:"typeId"`
		Scores   map[string]int `json:"scores"`
		Max      map[string]int `json:"max"`
		Passed   bool           `json:"passed"`
		Total    int            `json:"total"`
		MaxTotal int            `json:"maxTotal"`
		Blocks   []struct {
			ID    string `json:"id"`
			Score int    `json:"score"`
			Max   int    `json:"max"`
			Min   *int   `json:"min"`
			OK    bool   `json:"ok"`
		} `json:"blocks"`
	} `json:"verdicts"`
	Subject []struct {
		Score, Total int
		Passed       bool
	} `json:"subject"`
}

func loadParity(t *testing.T) *parityFile {
	t.Helper()
	b, err := os.ReadFile("testdata/parity.json")
	if err != nil {
		t.Fatal(err)
	}
	var p parityFile
	if err := json.Unmarshal(b, &p); err != nil {
		t.Fatal(err)
	}
	return &p
}

func TestParityQuestionScoring(t *testing.T) {
	p := loadParity(t)
	if len(p.Questions) < 1000 {
		t.Fatal("мало эталонных данных")
	}
	for i, c := range p.Questions {
		q := mkQ(t, string(c.Correct), 8)
		var a Answer
		if err := json.Unmarshal(c.Answer, &a); err != nil {
			t.Fatal(err)
		}
		if got := IsCorrect(q, a); got != c.IsCorrect {
			t.Fatalf("#%d IsCorrect(%s, %s) = %v, клиент: %v", i, c.Correct, c.Answer, got, c.IsCorrect)
		}
		if got := MaxPoints(q, c.Code, c.Block); got != c.Max {
			t.Fatalf("#%d MaxPoints(%s,%s/%s) = %d, клиент: %d", i, c.Correct, c.Code, c.Block, got, c.Max)
		}
		if got := EarnedPoints(q, a, c.Code, c.Block); got != c.Earned {
			t.Fatalf("#%d EarnedPoints(correct=%s, answer=%s, %s/%s) = %d, клиент: %d",
				i, c.Correct, c.Answer, c.Code, c.Block, got, c.Earned)
		}
	}
}

func TestParityKTVerdicts(t *testing.T) {
	p := loadParity(t)
	for i, v := range p.Verdicts {
		// строим план и вопросы так, чтобы сумма по блокам совпала с эталоном:
		// max[b] вопросов-«кирпичей» по 1 баллу, из них scores[b] верных.
		plan := &Plan{Kind: "kt:" + v.TypeID, Code: "X999"}
		var qs []*content.Question
		var answers []Answer
		for _, b := range Blocks {
			for k := 0; k < v.Max[b]; k++ {
				plan.Refs = append(plan.Refs, Ref{Block: b})
				qs = append(qs, mkQ(t, "0", 2))
				if k < v.Scores[b] {
					answers = append(answers, Answer{0})
				} else {
					answers = append(answers, Answer{1})
				}
			}
		}
		o, err := Grade(plan, qs, answers)
		if err != nil {
			t.Fatal(err)
		}
		if o.Passed != v.Passed || o.Score != v.Total || o.Total != v.MaxTotal {
			t.Fatalf("#%d %s scores=%v: got passed=%v %d/%d, клиент: passed=%v %d/%d",
				i, v.TypeID, v.Scores, o.Passed, o.Score, o.Total, v.Passed, v.Total, v.MaxTotal)
		}
		for j, b := range v.Blocks {
			g := o.Blocks[j]
			if g.ID != b.ID || g.Score != b.Score || g.Max != b.Max || g.OK != b.OK || (g.Min == nil) != (b.Min == nil) || (g.Min != nil && *g.Min != *b.Min) {
				t.Fatalf("#%d блок %s: %+v, клиент: %+v", i, b.ID, g, b)
			}
		}
	}
}

func TestParitySubjectPassMark(t *testing.T) {
	p := loadParity(t)
	for _, c := range p.Subject {
		plan := &Plan{Kind: KindSubject, Code: "X"}
		var qs []*content.Question
		var answers []Answer
		for k := 0; k < c.Total; k++ {
			plan.Refs = append(plan.Refs, Ref{Block: "subj1"})
			qs = append(qs, mkQ(t, "0", 2))
			if k < c.Score {
				answers = append(answers, Answer{0})
			} else {
				answers = append(answers, nil)
			}
		}
		o, _ := Grade(plan, qs, answers)
		if o.Passed != c.Passed || o.Score != c.Score || o.Total != c.Total {
			t.Fatalf("%d/%d: passed=%v, клиент: %v", c.Score, c.Total, o.Passed, c.Passed)
		}
	}
}

/* ---------- Сборка вариантов ---------- */

func countBy(refs []Ref, f func(Ref) string) map[string]int {
	m := map[string]int{}
	for _, r := range refs {
		m[f(r)]++
	}
	return m
}

func TestBuildKTScience(t *testing.T) {
	s := svc(t)
	for seed := uint64(1); seed <= 20; seed++ {
		p, err := BuildKT(s, seeded(seed), "nauchped", "7M01", "ru", "en")
		if err != nil {
			t.Fatal(err)
		}
		if len(p.Refs) != 130 {
			t.Fatalf("seed %d: %d вопросов, want 130", seed, len(p.Refs))
		}
		blocks := countBy(p.Refs, func(r Ref) string { return r.Block })
		if blocks["lang"] != 50 || blocks["logic"] != 30 || blocks["subj1"] != 30 || blocks["subj2"] != 20 {
			t.Fatalf("блоки: %v", blocks)
		}
		var langStages = map[string]int{}
		tracks := map[string]bool{}
		for _, r := range p.Refs {
			if r.Block != "lang" {
				if r.Stage != "" {
					t.Fatalf("stage у блока %s", r.Block)
				}
				continue
			}
			langStages[r.Stage]++
			if r.Stage == "listening" {
				b, _ := s.Bank(r.Bank)
				tracks[b.Questions[r.Idx].Audio] = true
			}
		}
		if langStages["listening"] != 16 || langStages["grammar"] != 18 || langStages["reading"] != 16 {
			t.Fatalf("английский: %v, want 16/18/16", langStages)
		}
		if len(tracks) != 2 {
			t.Fatalf("listening из %d дорожек, want 2 целых", len(tracks))
		}
		if p.Limit != 210*time.Minute || p.Kind != "kt:nauchped" || p.Lang != "en" {
			t.Fatalf("параметры: %+v", p)
		}
		// listening идёт группами по дорожкам, а не вперемешку
		var seq []string
		for _, r := range p.Refs {
			if r.Stage == "listening" {
				b, _ := s.Bank(r.Bank)
				a := b.Questions[r.Idx].Audio
				if len(seq) == 0 || seq[len(seq)-1] != a {
					seq = append(seq, a)
				}
			}
		}
		if len(seq) != 2 {
			t.Fatalf("дорожки перемешаны: %v", seq)
		}
	}
}

func TestBuildKTProfile(t *testing.T) {
	s := svc(t)
	p, err := BuildKT(s, seeded(7), "profile", "M107", "ru", "en")
	if err != nil {
		t.Fatal(err)
	}
	blocks := countBy(p.Refs, func(r Ref) string { return r.Block })
	if len(p.Refs) != 40 || blocks["lang"] != 10 || blocks["logic"] != 10 || blocks["subj1"] != 10 || blocks["subj2"] != 10 {
		t.Fatalf("блоки: %v", blocks)
	}
	// не-фиксированный английский: 10 вопросов делятся 4/3/3 по трём разделам
	st := countBy(p.Refs, func(r Ref) string {
		if r.Block == "lang" {
			return r.Stage
		}
		return "-"
	})
	if st["listening"] != 4 || st["grammar"] != 3 || st["reading"] != 3 {
		t.Fatalf("разделы английского: %v, want 4/3/3", st)
	}
}

func TestBuildKTRejections(t *testing.T) {
	s := svc(t)
	if _, err := BuildKT(s, seeded(1), "nope", "7M01", "ru", "en"); err != ErrBadKind {
		t.Errorf("тип: %v", err)
	}
	if _, err := BuildKT(s, seeded(1), "profile", "7M01", "ru", "de"); err != ErrBadLanguage {
		t.Errorf("язык: %v", err)
	}
	if _, err := BuildKT(s, seeded(1), "profile", "NOPE", "ru", "en"); err != ErrNoContent {
		t.Errorf("нет контента: %v", err)
	}
	if _, err := BuildKT(s, seeded(1), "profile", "7M01", "de", "en"); err != ErrNoContent {
		t.Errorf("нет языка контента: %v", err)
	}
}

func TestBuildSubject(t *testing.T) {
	s := svc(t)
	for _, section := range []string{"lang", "logic", "subj1", "subj2"} {
		p, err := BuildSubject(s, seeded(3), "7M01", "ru", section)
		if err != nil {
			t.Fatalf("%s: %v", section, err)
		}
		if len(p.Refs) != QuizMaxQuestions {
			t.Errorf("%s: %d вопросов, want %d", section, len(p.Refs), QuizMaxQuestions)
		}
		seen := map[string]bool{}
		for _, r := range p.Refs {
			k := r.Bank + "#" + string(rune(r.Idx))
			if seen[k] {
				t.Errorf("%s: повтор вопроса %v", section, r)
			}
			seen[k] = true
			if r.Block != section || r.Stage != "" {
				t.Errorf("%s: ссылка %+v", section, r)
			}
		}
		if p.Kind != KindSubject || p.Limit != 0 || p.Title == "" {
			t.Errorf("%s: %+v", section, p)
		}
	}
	// пул меньше 50 — берутся все вопросы (у 7M02 всего 4)
	p, _ := BuildSubject(s, seeded(3), "7M02", "ru", "subj1")
	if len(p.Refs) != 4 {
		t.Errorf("короткий пул: %d, want 4", len(p.Refs))
	}
	if _, err := BuildSubject(s, seeded(3), "7M01", "ru", "history"); err != ErrBadSection {
		t.Errorf("раздел: %v", err)
	}
	if _, err := BuildSubject(s, seeded(3), "NOPE", "ru", "subj1"); err != ErrNoContent {
		t.Errorf("нет контента: %v", err)
	}
	// общие предметы не зависят от кода направления и языка контента
	if _, err := BuildSubject(s, seeded(3), "NOPE", "kk", "logic"); err != nil {
		t.Errorf("logic без профильного контента: %v", err)
	}
}

func TestBuildIsRandom(t *testing.T) {
	s := svc(t)
	a, _ := BuildSubject(s, DefaultShuffler, "7M01", "ru", "subj1")
	b, _ := BuildSubject(s, DefaultShuffler, "7M01", "ru", "subj1")
	same := 0
	for i := range a.Refs {
		if a.Refs[i] == b.Refs[i] {
			same++
		}
	}
	if same > 10 {
		t.Errorf("два варианта почти совпадают (%d из 50) — нет перемешивания", same)
	}
}

func TestResolveDetectsStaleContent(t *testing.T) {
	s := svc(t)
	p, _ := BuildSubject(s, seeded(1), "7M01", "ru", "subj1")
	qs, err := Resolve(s, p.Refs)
	if err != nil || len(qs) != len(p.Refs) {
		t.Fatalf("Resolve: %v", err)
	}
	stale := append([]Ref(nil), p.Refs...)
	stale[3].FP = "deadbeef"
	if _, err := Resolve(s, stale); err != ErrStale {
		t.Errorf("устаревший отпечаток: %v", err)
	}
	stale = append([]Ref(nil), p.Refs...)
	stale[0].Idx = 99999
	if _, err := Resolve(s, stale); err != ErrStale {
		t.Errorf("индекс вне диапазона: %v", err)
	}
	stale = append([]Ref(nil), p.Refs...)
	stale[0].Bank = "p/NOPE/ru/subj1"
	if _, err := Resolve(s, stale); err != ErrStale {
		t.Errorf("нет банка: %v", err)
	}
}

/* ---------- Ответы, проекции, срок ---------- */

func TestAnswerJSON(t *testing.T) {
	var got []Answer
	if err := json.Unmarshal([]byte(`[null, 2, [0,1], []]`), &got); err != nil {
		t.Fatal(err)
	}
	if got[0] != nil || len(got[1]) != 1 || got[1][0] != 2 || len(got[2]) != 2 || len(got[3]) != 0 {
		t.Errorf("разбор: %#v", got)
	}
	for _, bad := range []string{`["a"]`, `[1.5]`, `[[1,"x"]]`, `[{"a":1}]`, `[true]`} {
		var a []Answer
		if err := json.Unmarshal([]byte(bad), &a); err == nil {
			t.Errorf("%s принят", bad)
		}
	}
}

func TestValidate(t *testing.T) {
	q := mkQ(t, "0", 4)
	qs := []*content.Question{q, q}
	ok := []Answer{{0}, nil}
	if err := Validate(qs, ok); err != nil {
		t.Errorf("корректные ответы: %v", err)
	}
	for name, bad := range map[string][]Answer{
		"мало ответов":     {{0}},
		"много ответов":    {{0}, {0}, {0}},
		"вне диапазона":    {{4}, nil},
		"отрицательный":    {{-1}, nil},
		"повтор":           {{1, 1}, nil},
		"больше вариантов": {{0, 1, 2, 3, 3}, nil},
	} {
		if Validate(qs, bad) == nil {
			t.Errorf("%s: принято", name)
		}
	}
	// выбор более 3 вариантов допустим (в тесте по предмету лимита нет)
	if err := Validate(qs, []Answer{{0, 1, 2, 3}, nil}); err != nil {
		t.Errorf("4 варианта из 4: %v", err)
	}
}

func TestPublicNeverLeaksKeys(t *testing.T) {
	s := svc(t)
	for _, build := range []func() *Plan{
		func() *Plan { p, _ := BuildKT(s, seeded(5), "nauchped", "7M01", "ru", "en"); return p },
		func() *Plan { p, _ := BuildSubject(s, seeded(5), "M107", "ru", "subj2"); return p },
		func() *Plan { p, _ := BuildSubject(s, seeded(5), "7M01", "ru", "lang"); return p },
	} {
		p := build()
		qs, _ := Resolve(s, p.Refs)
		b, err := json.Marshal(Public(p, qs))
		if err != nil {
			t.Fatal(err)
		}
		var generic []map[string]any
		json.Unmarshal(b, &generic)
		for i, m := range generic {
			for _, forbidden := range []string{"correct", "explanations", "why", "conspect", "conspectImage", "topic"} {
				if _, has := m[forbidden]; has {
					t.Fatalf("вопрос %d содержит ключ %q", i, forbidden)
				}
			}
		}
		// и текст пояснений не просочился в значения
		for _, q := range qs[:5] {
			for _, e := range q.Explanations {
				if len(e) > 30 && strings.Contains(string(b), strings.ReplaceAll(e[:30], `"`, `\"`)) {
					t.Fatalf("текст объяснения %q утёк в публичный вариант", e[:30])
				}
			}
		}
	}
}

func TestReviewKeepsCorrectShape(t *testing.T) {
	s := svc(t)
	p, _ := BuildSubject(s, seeded(2), "M107", "ru", "subj2")
	qs, _ := Resolve(s, p.Refs)
	rv := Review(qs)
	multi, single := 0, 0
	for i, r := range rv {
		isArr := len(r.Correct) > 0 && r.Correct[0] == '['
		if isArr != qs[i].Multi {
			t.Fatalf("форма correct не сохранена у %d", i)
		}
		if isArr {
			multi++
		} else {
			single++
		}
	}
	if multi == 0 || single == 0 {
		t.Logf("multi=%d single=%d", multi, single)
	}
}

func TestMultiUIForPartialCreditSubjects(t *testing.T) {
	single := mkQ(t, "1", 4)
	multi := mkQ(t, "[0,2]", 4)
	// тест по предмету: чекбокс только у вопросов с массивом correct
	if IsMultiUI(KindSubject, "M107", "subj2", single) || !IsMultiUI(KindSubject, "M107", "subj2", multi) {
		t.Error("тест по предмету: multi должен зависеть только от формы correct")
	}
	// КТ, предмет с частичным баллом: чекбоксы у ВСЕХ вопросов subj2 (не выдаём число верных)
	if !IsMultiUI(KindKTSci, "M107", "subj2", single) {
		t.Error("КТ subj2 частичного балла: одиночный вопрос должен быть с чекбоксами")
	}
	if IsMultiUI(KindKTSci, "M107", "subj1", single) || IsMultiUI(KindKTSci, "7M01", "subj2", single) {
		t.Error("чекбоксы только у subj2 предметов с частичным баллом")
	}
}

func TestExpiry(t *testing.T) {
	now := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	kt := &Plan{Limit: 210 * time.Minute}
	if got := kt.Expiry(now); got != now.Add(210*time.Minute+SubmitGrace) {
		t.Errorf("КТ: %v", got)
	}
	if got := (&Plan{}).Expiry(now); got != now.Add(SubjectTTL) {
		t.Errorf("предмет: %v", got)
	}
}

func TestTopicHits(t *testing.T) {
	q1 := mkQ(t, "0", 2)
	q1.Topic = "Тема А"
	q2 := mkQ(t, "0", 2) // без темы — в статистику не идёт
	plan := &Plan{Kind: KindKTProf, Code: "7M01", Refs: []Ref{{Block: "subj1"}, {Block: "logic"}}}
	o, err := Grade(plan, []*content.Question{q1, q2}, []Answer{{1}, {0}})
	if err != nil {
		t.Fatal(err)
	}
	if len(o.Hits) != 1 || o.Hits[0].Topic != "Тема А" || o.Hits[0].Correct || o.Hits[0].Section != "subj1" {
		t.Errorf("hits = %+v", o.Hits)
	}
}

func TestProfileOnlyDirection(t *testing.T) {
	s := svc(t)
	if !ProfileOnly("M078") || ProfileOnly("M063") {
		t.Fatal("ProfileOnly: ожидается только M078")
	}
	for _, sec := range []string{"lang", "logic"} {
		if _, err := BuildSubject(s, seeded(1), "M078", "ru", sec); err != ErrBadSection {
			t.Fatalf("M078/%s: err=%v, ожидалось ErrBadSection", sec, err)
		}
	}
	for _, sec := range []string{"subj1", "subj2"} {
		p, err := BuildSubject(s, seeded(1), "M078", "ru", sec)
		if err != nil || len(p.Refs) == 0 {
			t.Fatalf("M078/%s: %v (%d вопросов)", sec, err, len(p.Refs))
		}
	}
	if _, err := BuildKT(s, seeded(1), "nauchped", "M078", "ru", "en"); err != ErrBadKind {
		t.Fatalf("КТ для M078: err=%v, ожидалось ErrBadKind", err)
	}
	// у других направлений английский и ТГО остаются
	if _, err := BuildSubject(s, seeded(1), "M063", "ru", "lang"); err != nil {
		t.Fatalf("M063/lang: %v", err)
	}
}

func TestBuildKTProfileOnly(t *testing.T) {
	s := svc(t)
	p, err := BuildKT(s, seeded(2), "profile2", "M078", "ru", "")
	if err != nil {
		t.Fatal(err)
	}
	n := map[string]int{}
	for _, r := range p.Refs {
		n[r.Block]++
	}
	if len(p.Refs) != 50 || n["subj1"] != 30 || n["subj2"] != 20 || len(n) != 2 {
		t.Fatalf("блоки КТ M078: %v (всего %d), ожидалось subj1=30, subj2=20", n, len(p.Refs))
	}
	if p.Limit != 90*time.Minute || p.Lang != "" {
		t.Fatalf("limit=%v lang=%q", p.Limit, p.Lang)
	}
	qs, err := Resolve(s, p.Refs)
	if err != nil {
		t.Fatal(err)
	}
	// все ответы верные → максимум 30 + 20×2 = 70, оба блока без минимумов
	answers := make([]Answer, len(qs))
	for i, q := range qs {
		answers[i] = append(Answer(nil), q.Correct...)
	}
	o, err := Grade(p, qs, answers)
	if err != nil {
		t.Fatal(err)
	}
	if o.Score != 70 || o.Total != 70 || o.Threshold != 35 || !o.Passed || len(o.Blocks) != 2 {
		t.Fatalf("итог КТ M078: %+v", o)
	}
	// profile2 — только для направлений без общих предметов
	if _, err := BuildKT(s, seeded(2), "profile2", "M063", "ru", ""); err != ErrBadKind {
		t.Fatalf("profile2 для M063: err=%v, ожидалось ErrBadKind", err)
	}
}
