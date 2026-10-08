// Package exam — сборка варианта теста и проверка ответов на сервере.
// Чистая логика без БД и HTTP: то, что раньше жило в kt.js/script.js на клиенте
// (сборка КТ из пулов, начисление баллов, вердикт «сдал/не сдал»).
//
// Схема: сервер собирает вариант (Plan — список ссылок на вопросы банков), отдаёт
// клиенту вопросы БЕЗ ключей, а при сдаче сам проверяет ответы по ссылкам.
// Поэтому балл и вердикт нельзя подделать, а ключи не утекают до сдачи.
package exam

import (
	"errors"
	"math/rand/v2"
	"sort"
	"time"

	"marshrut-api/internal/content"
)

const (
	KindSubject = "subject" // тест по одному предмету
	KindKTSci   = "kt:nauchped"
	KindKTProf  = "kt:profile"
	// KindKTProf2 — симуляция КТ из двух профильных предметов (направления profileOnly, без английского и ТГО).
	KindKTProf2 = "kt:profile2"

	// QuizMaxQuestions — длина теста по одному предмету (пул перемешивается и обрезается).
	QuizMaxQuestions = 50

	// SubjectTTL — сколько живёт попытка теста по предмету (таймера в нём нет).
	SubjectTTL = 6 * time.Hour
	// SubmitGrace — запас на сдачу после окончания времени КТ (сеть, авто-сдача по таймеру).
	SubmitGrace = 5 * time.Minute
)

var (
	ErrNoContent   = errors.New("тест не найден")
	ErrBadSection  = errors.New("неизвестный предмет")
	ErrBadKind     = errors.New("неизвестный тип теста")
	ErrBadLanguage = errors.New("язык не поддерживается")
	ErrStale       = errors.New("тест обновлён — начните заново")
)

// profileOnly — направления, где сдаются только два профильных предмета: без
// английского и ТГО, без симуляции КТ (клиент: PROFILE_ONLY_CODES в script.js).
var profileOnly = map[string]bool{"M078": true}

// ProfileOnly — направление без общих предметов (английский, ТГО).
func ProfileOnly(code string) bool { return profileOnly[code] }

// Blocks — порядок блоков КТ.
var Blocks = []string{"lang", "logic", "subj1", "subj2"}

// KTType — параметры типа комплексного тестирования (переносятся из KT_TYPES в kt.js).
type KTType struct {
	ID        string
	BlockSize map[string]int
	LangFixed bool // английский: фиксированно 16 Listening (2 дорожки) + 18 Grammar + 16 Reading
	Total     int
	Threshold int
	TimeMin   int
	BlockMin  map[string]int // nil — минимумов по блокам нет, только общий порог
	Blocks    []string       // nil — все блоки КТ (Blocks); иначе только перечисленные
	NoCommon  bool           // без английского и ТГО: только subj1 + subj2
}

var ktTypes = map[string]*KTType{
	"nauchped": {
		ID: "nauchped", BlockSize: map[string]int{"lang": 50, "logic": 30, "subj1": 30, "subj2": 20},
		LangFixed: true, Total: 130, Threshold: 75, TimeMin: 210,
		BlockMin: map[string]int{"lang": 25, "logic": 14, "subj1": 7, "subj2": 7},
	},
	// profile2: два профильных предмета (30 + 20 вопросов; во втором до 2 баллов за вопрос). Время — 115 минут (задано владельцем; по спецификациям НЦТ: теория 60 мин + кейс 30 мин = 90).
	// Порог — условные 50% от максимума (35 из 70), минимумов по блокам нет.
	"profile2": {
		ID: "profile2", BlockSize: map[string]int{"subj1": 30, "subj2": 20},
		Total: 70, Threshold: 35, TimeMin: 115, Blocks: []string{"subj1", "subj2"}, NoCommon: true,
	},
	"profile": {
		ID: "profile", BlockSize: map[string]int{"lang": 10, "logic": 10, "subj1": 10, "subj2": 10},
		Total: 40, Threshold: 30, TimeMin: 210,
	},
}

// KTTypeByKind возвращает параметры КТ по виду попытки ("kt:nauchped" / "kt:profile").
func KTTypeByKind(kind string) (*KTType, bool) {
	if len(kind) > 3 && kind[:3] == "kt:" {
		t, ok := ktTypes[kind[3:]]
		return t, ok
	}
	return nil, false
}

// Ref — ссылка на вопрос банка в составе попытки.
type Ref struct {
	Bank  string `json:"b"`
	Idx   int    `json:"i"`
	Block string `json:"k"`           // блок КТ или предмет теста (lang/logic/subj1/subj2)
	Stage string `json:"s,omitempty"` // listening/grammar/reading — только у английского в КТ
	FP    string `json:"f"`           // отпечаток вопроса на момент сборки
}

// Plan — собранный вариант теста.
type Plan struct {
	Kind        string
	Code        string
	Section     string // только для теста по предмету
	Lang        string // иностранный язык КТ ("en")
	ContentLang string // язык профильного контента ("ru" | "kk")
	Title       string
	Refs        []Ref
	Limit       time.Duration // ограничение по времени (0 — без ограничения)
}

// Shuffler — источник случайности (в тестах подменяется детерминированным).
type Shuffler interface {
	Shuffle(n int, swap func(i, j int))
}

type globalRand struct{}

func (globalRand) Shuffle(n int, swap func(i, j int)) { rand.Shuffle(n, swap) }

// DefaultShuffler — криптостойкая (ChaCha8) случайность стандартной библиотеки.
var DefaultShuffler Shuffler = globalRand{}

// item — вопрос с его позицией в банке (внутренний тип сборки).
type item struct {
	idx   int
	q     *content.Question
	stage string
}

func toItems(b *content.Bank) []item {
	out := make([]item, len(b.Questions))
	for i, q := range b.Questions {
		out[i] = item{idx: i, q: q}
	}
	return out
}

// shuffled — перемешанная копия (Фишер—Йейтс), исходный срез не трогаем.
func shuffled(r Shuffler, in []item) []item {
	out := append([]item(nil), in...)
	r.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	return out
}

// cycle — n вопросов из пула: пул перемешивается, затем берётся n подряд, с
// повтором цикла, если n больше пула (kt.js: ktCycle).
func cycle(r Shuffler, pool []item, n int) []item {
	if len(pool) == 0 || n <= 0 {
		return nil
	}
	sh := shuffled(r, pool)
	out := make([]item, n)
	for i := range out {
		out[i] = sh[i%len(sh)]
	}
	return out
}

func withStage(items []item, stage string) []item {
	for i := range items {
		items[i].stage = stage
	}
	return items
}

// groupByAudio — стабильная сортировка по дорожке: студент проходит трек целиком,
// а не прыгает между записями (kt.js: groupListeningByTrack).
func groupByAudio(items []item) []item {
	sort.SliceStable(items, func(i, j int) bool { return items[i].q.Audio < items[j].q.Audio })
	return items
}

// cycleStaged распределяет n вопросов поровну между разделами (остаток — первым),
// чтобы при любом размере блока были все три раздела (kt.js: ktCycleStaged).
func cycleStaged(r Shuffler, stages []stagePool, n int) []item {
	k := len(stages)
	base := n / k
	rem := n - base*k
	var out []item
	for i, s := range stages {
		take := base
		if i < rem {
			take++
		}
		items := withStage(cycle(r, s.pool, take), s.name)
		if s.name == "listening" {
			items = groupByAudio(items)
		}
		out = append(out, items...)
	}
	return out
}

type stagePool struct {
	name string
	pool []item
}

// pickTracks — целиком N случайных аудиодорожек (kt.js: pickListeningTracks).
func pickTracks(r Shuffler, pool []item, tracks int) []item {
	var order []string
	byAudio := map[string][]item{}
	for _, it := range pool {
		if _, ok := byAudio[it.q.Audio]; !ok {
			order = append(order, it.q.Audio)
		}
		byAudio[it.q.Audio] = append(byAudio[it.q.Audio], it)
	}
	r.Shuffle(len(order), func(i, j int) { order[i], order[j] = order[j], order[i] })
	if tracks > len(order) {
		tracks = len(order)
	}
	var out []item
	for _, a := range order[:tracks] {
		out = append(out, withStage(append([]item(nil), byAudio[a]...), "listening")...)
	}
	return groupByAudio(out)
}

func mustBank(svc *content.Service, id string) (*content.Bank, error) {
	b, ok := svc.Bank(id)
	if !ok || len(b.Questions) == 0 {
		return nil, ErrNoContent
	}
	return b, nil
}

func refs(bank *content.Bank, items []item, block string) []Ref {
	out := make([]Ref, len(items))
	for i, it := range items {
		out[i] = Ref{Bank: bank.ID, Idx: it.idx, Block: block, Stage: it.stage, FP: it.q.FP}
	}
	return out
}

// BuildSubject собирает тест по одному предмету: пул предмета перемешивается и
// обрезается до QuizMaxQuestions (script.js: beginQuizSection).
func BuildSubject(svc *content.Service, r Shuffler, code, contentLang, section string) (*Plan, error) {
	p := &Plan{Kind: KindSubject, Code: code, Section: section, ContentLang: contentLang}
	if profileOnly[code] && (section == "lang" || section == "logic") {
		return nil, ErrBadSection
	}

	var banks []*content.Bank
	switch section {
	case "lang":
		for _, id := range []string{content.BankLangListening, content.BankLangGrammar, content.BankLangReading} {
			b, err := mustBank(svc, id)
			if err != nil {
				return nil, err
			}
			banks = append(banks, b)
		}
		p.Title = svc.CommonTitle("lang")
	case "logic":
		b, err := mustBank(svc, content.BankLogic)
		if err != nil {
			return nil, err
		}
		banks = []*content.Bank{b}
		p.Title = svc.CommonTitle("logic")
	case "subj1", "subj2":
		b, ok := svc.ProfileBank(code, contentLang, section)
		if !ok || len(b.Questions) == 0 {
			return nil, ErrNoContent
		}
		banks = []*content.Bank{b}
		p.Title = svc.ProfileTitle(code, contentLang)
	default:
		return nil, ErrBadSection
	}

	type located struct {
		bank *content.Bank
		it   item
	}
	var all []located
	for _, b := range banks {
		for _, it := range toItems(b) {
			all = append(all, located{b, it})
		}
	}
	r.Shuffle(len(all), func(i, j int) { all[i], all[j] = all[j], all[i] })
	if len(all) > QuizMaxQuestions {
		all = all[:QuizMaxQuestions]
	}
	for _, l := range all {
		p.Refs = append(p.Refs, refs(l.bank, []item{l.it}, section)...)
	}
	return p, nil
}

// BuildKT собирает симуляцию КТ (kt.js: assembleKT): блоки lang → logic → subj1 → subj2.
func BuildKT(svc *content.Service, r Shuffler, typeID, code, contentLang, lang string) (*Plan, error) {
	t, ok := ktTypes[typeID]
	// Направления без общих предметов проходят только КТ из двух профильных, остальные — только обычные типы.
	if !ok || profileOnly[code] != t.NoCommon {
		return nil, ErrBadKind
	}
	if t.NoCommon {
		return buildKTProfileOnly(svc, r, t, code, contentLang)
	}
	if lang != "en" { // в интерфейсе доступен только английский
		return nil, ErrBadLanguage
	}
	lis, err := mustBank(svc, content.BankLangListening)
	if err != nil {
		return nil, err
	}
	gra, err := mustBank(svc, content.BankLangGrammar)
	if err != nil {
		return nil, err
	}
	rea, err := mustBank(svc, content.BankLangReading)
	if err != nil {
		return nil, err
	}
	logic, err := mustBank(svc, content.BankLogic)
	if err != nil {
		return nil, err
	}
	s1, ok1 := svc.ProfileBank(code, contentLang, "subj1")
	s2, ok2 := svc.ProfileBank(code, contentLang, "subj2")
	if !ok1 || !ok2 || len(s1.Questions) == 0 || len(s2.Questions) == 0 {
		return nil, ErrNoContent
	}
	bs := t.BlockSize
	p := &Plan{Kind: "kt:" + typeID, Code: code, Lang: lang, ContentLang: contentLang,
		Title: svc.ProfileTitle(code, contentLang), Limit: time.Duration(t.TimeMin) * time.Minute}

	// Английский. Стадия у каждого вопроса своя, банк — по стадии.
	stageBank := map[string]*content.Bank{"listening": lis, "grammar": gra, "reading": rea}
	var langItems []item
	if t.LangFixed {
		langItems = append(langItems, pickTracks(r, toItems(lis), 2)...)
		langItems = append(langItems, withStage(cycle(r, toItems(gra), 18), "grammar")...)
		langItems = append(langItems, withStage(cycle(r, toItems(rea), 16), "reading")...)
	} else {
		langItems = cycleStaged(r, []stagePool{
			{"listening", toItems(lis)}, {"grammar", toItems(gra)}, {"reading", toItems(rea)},
		}, bs["lang"])
	}
	for _, it := range langItems {
		p.Refs = append(p.Refs, refs(stageBank[it.stage], []item{it}, "lang")...)
	}
	p.Refs = append(p.Refs, refs(logic, cycle(r, toItems(logic), bs["logic"]), "logic")...)
	p.Refs = append(p.Refs, refs(s1, cycle(r, toItems(s1), bs["subj1"]), "subj1")...)
	p.Refs = append(p.Refs, refs(s2, cycle(r, toItems(s2), bs["subj2"]), "subj2")...)
	return p, nil
}

// Expiry — до какого момента принимаются ответы: время теста + запас на сдачу.
func (p *Plan) Expiry(created time.Time) time.Time {
	if p.Limit > 0 {
		return created.Add(p.Limit + SubmitGrace)
	}
	return created.Add(SubjectTTL)
}

// Resolve возвращает вопросы плана, сверяя отпечатки: если банк изменился после
// сборки (деплой), проверять ответы по другим вопросам нельзя.
func Resolve(svc *content.Service, refs []Ref) ([]*content.Question, error) {
	out := make([]*content.Question, len(refs))
	for i, r := range refs {
		b, ok := svc.Bank(r.Bank)
		if !ok || r.Idx < 0 || r.Idx >= len(b.Questions) || b.Questions[r.Idx].FP != r.FP {
			return nil, ErrStale
		}
		out[i] = b.Questions[r.Idx]
	}
	return out, nil
}

// buildKTProfileOnly собирает КТ из двух профильных предметов (subj1 → subj2) для направлений
// без английского и ТГО.
func buildKTProfileOnly(svc *content.Service, r Shuffler, t *KTType, code, contentLang string) (*Plan, error) {
	s1, ok1 := svc.ProfileBank(code, contentLang, "subj1")
	s2, ok2 := svc.ProfileBank(code, contentLang, "subj2")
	if !ok1 || !ok2 || len(s1.Questions) == 0 || len(s2.Questions) == 0 {
		return nil, ErrNoContent
	}
	p := &Plan{Kind: "kt:" + t.ID, Code: code, ContentLang: contentLang,
		Title: svc.ProfileTitle(code, contentLang), Limit: time.Duration(t.TimeMin) * time.Minute}
	p.Refs = append(p.Refs, refs(s1, cycle(r, toItems(s1), t.BlockSize["subj1"]), "subj1")...)
	p.Refs = append(p.Refs, refs(s2, cycle(r, toItems(s2), t.BlockSize["subj2"]), "subj2")...)
	return p, nil
}
