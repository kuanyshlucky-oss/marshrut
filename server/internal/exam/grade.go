package exam

import (
	"encoding/json"
	"errors"
	"math"
	"slices"

	"marshrut-api/internal/content"
)

var ErrBadAnswers = errors.New("некорректные ответы")

// Answer — ответ на один вопрос: nil = без ответа, иначе индексы выбранных
// вариантов. В JSON: null | число (один вариант) | массив чисел (несколько).
type Answer []int

func (a *Answer) UnmarshalJSON(b []byte) error {
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	switch x := v.(type) {
	case nil:
		*a = nil
	case float64:
		if x != math.Trunc(x) {
			return ErrBadAnswers
		}
		*a = Answer{int(x)}
	case []any:
		out := make(Answer, 0, len(x))
		for _, e := range x {
			f, ok := e.(float64)
			if !ok || f != math.Trunc(f) {
				return ErrBadAnswers
			}
			out = append(out, int(f))
		}
		*a = out
	default:
		return ErrBadAnswers
	}
	return nil
}

// Validate проверяет форму ответов: по одному на вопрос, индексы в диапазоне, без повторов.
func Validate(qs []*content.Question, answers []Answer) error {
	if len(answers) != len(qs) {
		return ErrBadAnswers
	}
	for i, a := range answers {
		if len(a) > len(qs[i].Options) {
			return ErrBadAnswers
		}
		seen := map[int]bool{}
		for _, o := range a {
			if o < 0 || o >= len(qs[i].Options) || seen[o] {
				return ErrBadAnswers
			}
			seen[o] = true
		}
	}
	return nil
}

// partialCreditCodes — предметы (subj2) с частичным начислением баллов по
// официальной схеме КТ для вопросов с множественным выбором.
var partialCreditCodes = map[string]bool{
	"M123": true, "M066": true, "M107": true, "M005": true, "M103": true, "M115": true, "M149": true,
}

// PartialCredit: 2 балла — все верные выбраны и ни одного лишнего; 1 балл —
// ровно одна ошибка (не выбран один верный ИЛИ выбран один лишний); иначе 0.
// Остальные предметы (и вопросы с одним ответом) — «всё или ничего» за 1 балл.
func PartialCredit(code, block string) bool { return block == "subj2" && partialCreditCodes[code] }

// IsMultiUI — рисовать ли для вопроса чекбоксы. Для предметов с частичным баллом
// чекбоксы у ВСЕХ вопросов (радио/чекбокс не должен выдавать число верных).
func IsMultiUI(kind, code, block string, q *content.Question) bool {
	if q.Multi {
		return true
	}
	return kind != KindSubject && PartialCredit(code, block)
}

func sameSet(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	x, y := slices.Clone(a), slices.Clone(b)
	slices.Sort(x)
	slices.Sort(y)
	return slices.Equal(x, y)
}

// IsCorrect — полностью ли верен ответ.
func IsCorrect(q *content.Question, a Answer) bool {
	return len(a) > 0 && sameSet(q.Correct, a)
}

// MaxPoints — максимум за вопрос (2 у вопросов с множественным выбором в предметах с частичным баллом).
func MaxPoints(q *content.Question, code, block string) int {
	if q.Multi && PartialCredit(code, block) {
		return 2
	}
	return 1
}

// EarnedPoints — баллы за ответ.
func EarnedPoints(q *content.Question, a Answer, code, block string) int {
	if q.Multi && PartialCredit(code, block) {
		if len(a) == 0 {
			return 0
		}
		mistakes := 0
		for _, c := range q.Correct {
			if !slices.Contains(a, c) {
				mistakes++
			}
		}
		for _, o := range a {
			if !slices.Contains(q.Correct, o) {
				mistakes++
			}
		}
		switch mistakes {
		case 0:
			return 2
		case 1:
			return 1
		}
		return 0
	}
	if IsCorrect(q, a) {
		return 1
	}
	return 0
}

type BlockResult struct {
	ID    string `json:"id"`
	Score int    `json:"score"`
	Max   int    `json:"max"`
	Min   *int   `json:"min"` // nil — у блока нет минимума
	OK    bool   `json:"ok"`
}

// TopicHit — итог по вопросу с темой (для статистики по темам в кабинете).
type TopicHit struct {
	Topic   string
	Correct bool
	Section string
}

// Outcome — итог проверки попытки.
type Outcome struct {
	Kind      string        `json:"kind"`
	Score     int           `json:"score"`
	Total     int           `json:"total"`
	Passed    bool          `json:"passed"`
	Threshold int           `json:"thresholdTotal,omitempty"` // только КТ
	Blocks    []BlockResult `json:"blocks,omitempty"`         // только КТ
	Hits      []TopicHit    `json:"-"`
}

// SubjectPassPercent — проходной процент теста по одному предмету.
const SubjectPassPercent = 60

// Grade проверяет ответы по плану. Answers уже должны пройти Validate.
func Grade(p *Plan, qs []*content.Question, answers []Answer) (*Outcome, error) {
	if len(qs) != len(p.Refs) || len(answers) != len(qs) {
		return nil, ErrBadAnswers
	}
	o := &Outcome{Kind: p.Kind}
	blockScore := map[string]int{}
	blockMax := map[string]int{}
	for i, q := range qs {
		block := p.Refs[i].Block
		e, m := EarnedPoints(q, answers[i], p.Code, block), MaxPoints(q, p.Code, block)
		blockScore[block] += e
		blockMax[block] += m
		o.Score += e
		o.Total += m
		if q.Topic != "" {
			o.Hits = append(o.Hits, TopicHit{Topic: q.Topic, Correct: IsCorrect(q, answers[i]), Section: block})
		}
	}
	if t, ok := KTTypeByKind(p.Kind); ok {
		o.Threshold = t.Threshold
		allBlocksOK := true
		for _, id := range Blocks {
			br := BlockResult{ID: id, Score: blockScore[id], Max: blockMax[id], OK: true}
			if t.BlockMin != nil {
				m := t.BlockMin[id]
				br.Min = &m
				br.OK = br.Score >= m
			}
			allBlocksOK = allBlocksOK && br.OK
			o.Blocks = append(o.Blocks, br)
		}
		o.Passed = o.Score >= t.Threshold && allBlocksOK
		return o, nil
	}
	if o.Total > 0 {
		// как Math.round на клиенте: .5 округляется вверх
		o.Passed = math.Floor(float64(o.Score)/float64(o.Total)*100+0.5) >= SubjectPassPercent
	}
	return o, nil
}

// PublicQuestion — вопрос для клиента: всё, что нужно показать, но БЕЗ ключей.
type PublicQuestion struct {
	Q                 string   `json:"q"`
	Options           []string `json:"options"`
	OptionImages      []string `json:"optionImages,omitempty"`
	Image             string   `json:"image,omitempty"`
	ImageReplacesText bool     `json:"imageReplacesText,omitempty"`
	Audio             string   `json:"audio,omitempty"`
	Passage           string   `json:"passage,omitempty"`
	Multi             bool     `json:"multi"`
	Block             string   `json:"block,omitempty"`
	Stage             string   `json:"stage,omitempty"`
}

// ReviewItem — ключи и разбор вопроса; отдаются только после сдачи попытки.
// Correct сохраняет исходную форму (число или массив): разбор на клиенте различает их.
type ReviewItem struct {
	Correct       json.RawMessage `json:"correct"`
	Why           string          `json:"why,omitempty"`
	Explanations  []string        `json:"explanations,omitempty"`
	Conspect      string          `json:"conspect,omitempty"`
	ConspectImage string          `json:"conspectImage,omitempty"`
	Topic         string          `json:"topic,omitempty"`
}

// Public строит клиентское представление вопросов попытки.
func Public(p *Plan, qs []*content.Question) []PublicQuestion {
	out := make([]PublicQuestion, len(qs))
	for i, q := range qs {
		ref := p.Refs[i]
		pq := PublicQuestion{
			Q: q.Q, Options: q.Options, OptionImages: q.OptionImages, Image: q.Image,
			ImageReplacesText: q.ImageReplacesText, Audio: q.Audio, Passage: q.Passage,
			Multi: IsMultiUI(p.Kind, p.Code, ref.Block, q), Stage: ref.Stage,
		}
		if p.Kind != KindSubject {
			pq.Block = ref.Block
		}
		out[i] = pq
	}
	return out
}

// Review строит ключи и разбор для сдавшего попытку.
func Review(qs []*content.Question) []ReviewItem {
	out := make([]ReviewItem, len(qs))
	for i, q := range qs {
		out[i] = ReviewItem{
			Correct: q.CorrectRaw, Why: q.Why, Explanations: q.Explanations,
			Conspect: q.Conspect, ConspectImage: q.ConspectImage, Topic: q.Topic,
		}
	}
	return out
}
