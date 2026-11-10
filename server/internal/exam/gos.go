package exam

import "marshrut-api/internal/content"

// Тест по госслужбе («Онлайн-тренажёр тестов», код GOSSLUZHBA): четыре акта = четыре блока
// subj1..subj4 (Конституция, закон о госслужбе, закон о противодействии коррупции, Этический кодекс).
//
// Отдельный вид попытки, а не КТ: у КТ своя структура (lang/logic/subj1/subj2), а во втором профильном
// предмете КТ всегда рисуются чекбоксы (IsMultiUI). Здесь вопросы с одним верным ответом, радио-кнопки.
//
//	section "mock"  — пробный тест: 55 вопросов (14/14/14/13), «сдал», если верных не менее 30 и не менее 5
//	                  по каждому акту (правила заданы владельцем продукта, не официальные);
//	section "subjN" — тренировка по одному акту: до QuizMaxQuestions вопросов, вердикт — как у теста по предмету.
const (
	KindGos = "gos"
	// GosMock — раздел-пробный тест.
	GosMock = "mock"

	GosThreshold = 30 // верных ответов всего
	GosBlockMin  = 5  // верных ответов по каждому акту
)

// gosCodes — тесты, которые собираются как «тест по госслужбе».
var gosCodes = map[string]bool{"GOSSLUZHBA": true}

// gosBlocks — акты в порядке следования в тесте.
var gosBlocks = []string{"subj1", "subj2", "subj3", "subj4"}

// gosMockSize — сколько вопросов берётся из каждого акта в пробный тест.
var gosMockSize = map[string]int{"subj1": 14, "subj2": 14, "subj3": 14, "subj4": 13}

// IsGos — собирается ли тест с этим кодом как тест по госслужбе.
func IsGos(code string) bool { return gosCodes[code] }

// gosBank возвращает банк акта строго из bySubject: общий список (запасной вариант ProfileBank)
// здесь не годится, иначе у теста без нужного акта вопросы подменились бы чужими.
func gosBank(svc *content.Service, code, contentLang, block string) (*content.Bank, error) {
	if !svc.HasSubject(code, contentLang, block) {
		return nil, ErrNoContent
	}
	b, ok := svc.ProfileBank(code, contentLang, block)
	if !ok || len(b.Questions) == 0 {
		return nil, ErrNoContent
	}
	return b, nil
}

// BuildGos собирает попытку по госслужбе: пробный тест (section "mock") или тренировку по акту (section "subjN").
func BuildGos(svc *content.Service, r Shuffler, code, contentLang, section string) (*Plan, error) {
	if !gosCodes[code] {
		return nil, ErrNoContent
	}
	p := &Plan{Kind: KindGos, Code: code, Section: section, ContentLang: contentLang, Title: svc.ProfileTitle(code, contentLang)}
	if section == GosMock {
		for _, block := range gosBlocks {
			b, err := gosBank(svc, code, contentLang, block)
			if err != nil {
				return nil, err
			}
			n := gosMockSize[block]
			if len(b.Questions) < n { // повторы вопросов в пробном тесте недопустимы
				return nil, ErrNoContent
			}
			// distinctFirst отодвигает дубли формулировок в конец, пока хватает разных
			p.Refs = append(p.Refs, refs(b, distinctFirst(shuffled(r, toItems(b)))[:n], block)...)
		}
		return p, nil
	}
	valid := false
	for _, block := range gosBlocks {
		valid = valid || block == section
	}
	if !valid {
		return nil, ErrBadSection
	}
	b, err := gosBank(svc, code, contentLang, section)
	if err != nil {
		return nil, err
	}
	pool := distinctFirst(shuffled(r, toItems(b)))
	if len(pool) > QuizMaxQuestions {
		pool = pool[:QuizMaxQuestions]
	}
	p.Refs = refs(b, pool, section)
	return p, nil
}

// gradeGosMock — итог пробного теста: общий порог и минимум по каждому акту.
func gradeGosMock(o *Outcome, blockScore, blockMax map[string]int) {
	o.Threshold = GosThreshold
	allOK := true
	for _, id := range gosBlocks {
		min := GosBlockMin
		br := BlockResult{ID: id, Score: blockScore[id], Max: blockMax[id], Min: &min, OK: blockScore[id] >= min}
		allOK = allOK && br.OK
		o.Blocks = append(o.Blocks, br)
	}
	o.Passed = o.Score >= GosThreshold && allOK
}
