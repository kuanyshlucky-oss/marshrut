// Package content — банки вопросов, вшитые в бинарник.
//
// Ключи ответов (correct, explanations, conspect) никогда не отдаются клиенту
// целиком: вариант собирает сервер (пакет exam), клиент получает вопросы без
// ключей, а ключи возвращаются только после сдачи попытки.
//
// Профильные тесты: data/<код>.json — русский (по умолчанию),
// data/<код>-kk.json — казахский. Общие предметы (английский, ТГО): common/*.json.
package content

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

//go:embed data/*.json common/*.json
var dataFS embed.FS

// gopCodeByDirection — код группы образовательных программ (ГОП, из официальной
// статистики КТ, напр. "M001") для внутреннего кода направления — только для
// отображения в админке, на доступ не влияет.
var gopCodeByDirection = map[string]string{
	"7M01": "M001",
}

// minQuestionsForAdmin — направления с банком вопросов меньше этого порога
// считаются заглушками и не показываются в админке при выдаче доступа.
const minQuestionsForAdmin = 20

// Question — один вопрос банка со всеми полями, включая ключ.
type Question struct {
	Q                 string
	Options           []string
	OptionImages      []string
	Image             string
	ImageReplacesText bool
	Audio             string
	Passage           string

	// Correct — индексы верных вариантов; Multi — в источнике это массив
	// (даже из одного элемента). CorrectRaw — исходная форма (число или массив):
	// разбор на клиенте различает их.
	Correct    []int
	Multi      bool
	CorrectRaw json.RawMessage

	Why           string
	Explanations  []string
	Conspect      string
	ConspectImage string
	Topic         string

	// FP — отпечаток текста вопроса: попытка хранит ссылки (банк, индекс), и если
	// после деплоя банк изменился, несовпадение отпечатка не даст проверить
	// ответы не по тем вопросам.
	FP string
}

type rawQuestion struct {
	Q                 string          `json:"q"`
	Options           []string        `json:"options"`
	OptionImages      []string        `json:"optionImages"`
	Image             string          `json:"image"`
	ImageReplacesText bool            `json:"imageReplacesText"`
	Audio             string          `json:"audio"`
	Passage           string          `json:"passage"`
	Correct           json.RawMessage `json:"correct"`
	Why               string          `json:"why"`
	Explanations      []string        `json:"explanations"`
	Conspect          string          `json:"conspect"`
	ConspectImage     string          `json:"conspectImage"`
	Topic             string          `json:"topic"`
}

func newQuestion(r rawQuestion) (*Question, error) {
	q := &Question{
		Q: r.Q, Options: r.Options, OptionImages: r.OptionImages, Image: r.Image,
		ImageReplacesText: r.ImageReplacesText, Audio: r.Audio, Passage: r.Passage,
		CorrectRaw: r.Correct, Why: r.Why, Explanations: r.Explanations,
		Conspect: r.Conspect, ConspectImage: r.ConspectImage, Topic: r.Topic,
	}
	if len(r.Correct) > 0 && r.Correct[0] == '[' {
		q.Multi = true
		if err := json.Unmarshal(r.Correct, &q.Correct); err != nil {
			return nil, err
		}
	} else {
		var one int
		if err := json.Unmarshal(r.Correct, &one); err != nil {
			return nil, err
		}
		q.Correct = []int{one}
	}
	if len(q.Options) == 0 {
		return nil, fmt.Errorf("вопрос без вариантов: %.40q", q.Q)
	}
	for _, c := range q.Correct {
		if c < 0 || c >= len(q.Options) {
			return nil, fmt.Errorf("верный вариант %d вне диапазона у вопроса %.40q", c, q.Q)
		}
	}
	sum := sha256.Sum256([]byte(q.Q + "\x00" + strings.Join(q.Options, "\x00")))
	q.FP = hex.EncodeToString(sum[:4])
	return q, nil
}

// Bank — упорядоченный список вопросов; ссылка на вопрос = (ID банка, индекс).
type Bank struct {
	ID        string
	Questions []*Question
}

// Идентификаторы общих банков.
const (
	BankLangListening = "c/lang-en/listening"
	BankLangGrammar   = "c/lang-en/grammar"
	BankLangReading   = "c/lang-en/reading"
	BankLogic         = "c/logic"
)

// Info — то, что видит админ при выдаче доступа.
type Info struct {
	Code     string `json:"code"`
	Language string `json:"language"`
	GopCode  string `json:"gopCode,omitempty"`
	Title    string `json:"title"`
}

type fileKey struct{ code, lang string }

// profileFile — один файл профильного теста: банки по предметам + плоский список.
type profileFile struct {
	title     string
	flat      *Bank
	bySubject map[string]*Bank
}

type Service struct {
	profile map[fileKey]*profileFile
	banks   map[string]*Bank
	infos   []Info
	titles  map[string]string // заголовки общих банков
}

// Load читает и проверяет весь контент. Ошибка = битый файл в сборке.
func Load() (*Service, error) {
	s := &Service{
		profile: make(map[fileKey]*profileFile),
		banks:   make(map[string]*Bank),
		titles:  make(map[string]string),
	}
	if err := s.loadProfile(); err != nil {
		return nil, err
	}
	if err := s.loadCommon(); err != nil {
		return nil, err
	}
	s.buildInfos()
	return s, nil
}

func parseBank(id string, raws []rawQuestion) (*Bank, error) {
	b := &Bank{ID: id, Questions: make([]*Question, 0, len(raws))}
	for i, r := range raws {
		q, err := newQuestion(r)
		if err != nil {
			return nil, fmt.Errorf("%s[%d]: %w", id, i, err)
		}
		b.Questions = append(b.Questions, q)
	}
	return b, nil
}

func (s *Service) loadProfile() error {
	entries, err := dataFS.ReadDir("data")
	if err != nil {
		return err
	}
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".json") {
			continue
		}
		raw, err := dataFS.ReadFile("data/" + name)
		if err != nil {
			return err
		}
		base := strings.TrimSuffix(name, ".json")
		k := fileKey{code: base, lang: "ru"}
		if code, ok := strings.CutSuffix(base, "-kk"); ok {
			k = fileKey{code: code, lang: "kk"}
		}
		var f struct {
			Title     string                   `json:"title"`
			Questions []rawQuestion            `json:"questions"`
			BySubject map[string][]rawQuestion `json:"bySubject"`
		}
		if err := json.Unmarshal(raw, &f); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		pf := &profileFile{title: f.Title, bySubject: make(map[string]*Bank)}
		prefix := "p/" + k.code + "/" + k.lang + "/"
		if pf.flat, err = parseBank(prefix+"q", f.Questions); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		s.banks[pf.flat.ID] = pf.flat
		for subj, qs := range f.BySubject {
			b, err := parseBank(prefix+subj, qs)
			if err != nil {
				return fmt.Errorf("%s: %w", name, err)
			}
			pf.bySubject[subj] = b
			s.banks[b.ID] = b
		}
		s.profile[k] = pf
	}
	return nil
}

func (s *Service) loadCommon() error {
	raw, err := dataFS.ReadFile("common/lang-en.json")
	if err != nil {
		return err
	}
	var lang struct {
		Title  string                   `json:"title"`
		Stages map[string][]rawQuestion `json:"stages"`
	}
	if err := json.Unmarshal(raw, &lang); err != nil {
		return fmt.Errorf("common/lang-en.json: %w", err)
	}
	for stage, id := range map[string]string{
		"listening": BankLangListening, "grammar": BankLangGrammar, "reading": BankLangReading,
	} {
		b, err := parseBank(id, lang.Stages[stage])
		if err != nil {
			return err
		}
		if len(b.Questions) == 0 {
			return fmt.Errorf("пустой банк %s", id)
		}
		s.banks[id] = b
	}
	s.titles["lang"] = lang.Title

	raw, err = dataFS.ReadFile("common/logic.json")
	if err != nil {
		return err
	}
	var logic struct {
		Title     string        `json:"title"`
		Questions []rawQuestion `json:"questions"`
	}
	if err := json.Unmarshal(raw, &logic); err != nil {
		return fmt.Errorf("common/logic.json: %w", err)
	}
	b, err := parseBank(BankLogic, logic.Questions)
	if err != nil {
		return err
	}
	if len(b.Questions) == 0 {
		return fmt.Errorf("пустой банк %s", BankLogic)
	}
	s.banks[BankLogic] = b
	s.titles["logic"] = logic.Title
	return nil
}

// Has — есть ли профильный тест для кода направления и языка ("ru" | "kk").
func (s *Service) Has(code, lang string) bool {
	_, ok := s.profile[fileKey{code, lang}]
	return ok
}

// Bank возвращает банк по идентификатору.
func (s *Service) Bank(id string) (*Bank, bool) {
	b, ok := s.banks[id]
	return b, ok
}

// ProfileBank — банк профильного предмета (subj1/subj2): вопросы предмета из
// bySubject, а если у направления нет разбивки по предметам — общий список.
func (s *Service) ProfileBank(code, lang, subject string) (*Bank, bool) {
	pf, ok := s.profile[fileKey{code, lang}]
	if !ok {
		return nil, false
	}
	if b, ok := pf.bySubject[subject]; ok {
		return b, true
	}
	return pf.flat, true
}

// ProfileTitle — заголовок профильного теста.
func (s *Service) ProfileTitle(code, lang string) string {
	if pf, ok := s.profile[fileKey{code, lang}]; ok {
		return pf.title
	}
	return ""
}

// CommonTitle — заголовок общего предмета ("lang" | "logic").
func (s *Service) CommonTitle(section string) string { return s.titles[section] }

// Infos — список тестов для админки (без заглушек), отсортирован по коду и языку.
func (s *Service) Infos() []Info { return s.infos }

func (s *Service) buildInfos() {
	keys := make([]fileKey, 0, len(s.profile))
	for k := range s.profile {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].code != keys[j].code {
			return keys[i].code < keys[j].code
		}
		return keys[i].lang < keys[j].lang
	})
	s.infos = make([]Info, 0, len(keys))
	for _, k := range keys {
		pf := s.profile[k]
		if countQuestions(pf) < minQuestionsForAdmin {
			continue
		}
		s.infos = append(s.infos, Info{Code: k.code, Language: k.lang, GopCode: gopCodeByDirection[k.code], Title: pf.title})
	}
}

// countQuestions: и плоский список, и разбивка по предметам встречаются в контенте.
func countQuestions(pf *profileFile) int {
	if n := len(pf.flat.Questions); n > 0 {
		return n
	}
	n := 0
	for _, b := range pf.bySubject {
		n += len(b.Questions)
	}
	return n
}
