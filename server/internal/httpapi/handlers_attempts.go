package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"time"

	"marshrut-api/internal/auth"
	"marshrut-api/internal/content"
	"marshrut-api/internal/exam"
	"marshrut-api/internal/store"
)

// Попытки тестов. Сервер сам собирает вариант и отдаёт вопросы БЕЗ ключей; при
// сдаче сам проверяет ответы, считает балл и вердикт и сохраняет результат;
// ключи и разбор возвращаются только после сдачи. Клиент не может ни подделать
// результат, ни получить ответы, не пройдя тест.

var attemptIDRe = regexp.MustCompile(`^[A-Za-z0-9]{24}$`)

var validAttemptKinds = map[string]bool{exam.KindSubject: true, exam.KindKTSci: true, exam.KindKTProf: true}

const msgNoAccess = "Нет доступа к этому тесту — обратитесь к администратору для получения доступа"

// POST /api/attempts
// {kind:"subject", code, section:"lang|logic|subj1|subj2", contentLang}
// {kind:"kt:nauchped"|"kt:profile", code, lang:"en", contentLang}
func (s *Server) handleCreateAttempt(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Kind        string `json:"kind"`
		Code        string `json:"code"`
		Section     string `json:"section"`
		Lang        string `json:"lang"`
		ContentLang string `json:"contentLang"`
	}
	if err := decode(w, r, &in); err != nil || !validAttemptKinds[in.Kind] || !validCode(in.Code) {
		writeError(w, http.StatusBadRequest, "Неверные параметры теста")
		return
	}
	contentLang := normalizeLang(in.ContentLang)
	uid := currentUID(r)

	// Профильные предметы и вся симуляция КТ — только с выданным доступом; английский
	// и ТГО (отдельные тесты по предмету) доступны любому вошедшему пользователю.
	needsAccess := in.Kind != exam.KindSubject || in.Section == "subj1" || in.Section == "subj2"
	if needsAccess {
		ok, err := s.store.HasAccess(r.Context(), uid, in.Code, contentLang)
		if err != nil {
			s.dbError(w, r, "проверка доступа к тесту", err)
			return
		}
		if !ok {
			writeError(w, http.StatusForbidden, msgNoAccess)
			return
		}
	}

	var plan *exam.Plan
	var err error
	if in.Kind == exam.KindSubject {
		plan, err = exam.BuildSubject(s.content, exam.DefaultShuffler, in.Code, contentLang, in.Section)
	} else {
		lang := in.Lang
		if lang == "" {
			lang = "en"
		}
		typeID := in.Kind[len("kt:"):]
		plan, err = exam.BuildKT(s.content, exam.DefaultShuffler, typeID, in.Code, contentLang, lang)
	}
	switch {
	case errors.Is(err, exam.ErrNoContent):
		writeError(w, http.StatusNotFound, "Тест не найден")
		return
	case errors.Is(err, exam.ErrBadSection), errors.Is(err, exam.ErrBadKind), errors.Is(err, exam.ErrBadLanguage):
		writeError(w, http.StatusBadRequest, "Неверные параметры теста")
		return
	case err != nil:
		s.dbError(w, r, "сборка теста", err)
		return
	}

	items, _ := json.Marshal(plan.Refs)
	now := time.Now()
	a := &store.Attempt{
		ID: auth.RandString(24), UserID: uid, Kind: plan.Kind, Code: plan.Code, Section: plan.Section,
		Lang: plan.Lang, ContentLang: plan.ContentLang, Title: plan.Title, Items: items,
		ExpiresAt: plan.Expiry(now),
	}
	if err := s.store.CreateAttempt(r.Context(), a); err != nil {
		if errors.Is(err, store.ErrTooManyAttempts) {
			writeError(w, http.StatusTooManyRequests, "Слишком много попыток за час. Попробуйте позже.")
			return
		}
		s.dbError(w, r, "создание попытки", err)
		return
	}
	qs, err := exam.Resolve(s.content, plan.Refs)
	if err != nil { // только что собранный план — сюда попасть не должны
		s.dbError(w, r, "разбор плана попытки", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id": a.ID, "kind": a.Kind, "code": a.Code, "section": a.Section, "lang": a.Lang, "title": a.Title,
		"limitSeconds": int(plan.Limit.Seconds()), "expiresAt": a.ExpiresAt.UTC().Format(time.RFC3339),
		"questions": exam.Public(plan, qs),
	})
}

// evaluated — попытка, восстановленная из БД: план, вопросы, ответы и итог.
type evaluated struct {
	plan    *exam.Plan
	qs      []*content.Question
	answers []exam.Answer
	outcome *exam.Outcome
}

// evaluate восстанавливает попытку и проверяет её ответы (a.Answers должны быть заполнены).
func (s *Server) evaluate(a *store.Attempt) (*evaluated, error) {
	var refs []exam.Ref
	if err := json.Unmarshal(a.Items, &refs); err != nil {
		return nil, err
	}
	plan := &exam.Plan{Kind: a.Kind, Code: a.Code, Section: a.Section, Lang: a.Lang,
		ContentLang: a.ContentLang, Title: a.Title, Refs: refs}
	qs, err := exam.Resolve(s.content, refs)
	if err != nil {
		return nil, err
	}
	var answers []exam.Answer
	if err := json.Unmarshal(a.Answers, &answers); err != nil {
		return nil, exam.ErrBadAnswers
	}
	if err := exam.Validate(qs, answers); err != nil {
		return nil, err
	}
	o, err := exam.Grade(plan, qs, answers)
	if err != nil {
		return nil, err
	}
	return &evaluated{plan: plan, qs: qs, answers: answers, outcome: o}, nil
}

// POST /api/attempts/{id}/submit {answers:[null | n | [n,...], ...]}
func (s *Server) handleSubmitAttempt(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !attemptIDRe.MatchString(id) {
		writeError(w, http.StatusNotFound, "Попытка не найдена")
		return
	}
	var in struct {
		Answers json.RawMessage `json:"answers"`
	}
	if err := decode(w, r, &in); err != nil || len(in.Answers) == 0 {
		writeError(w, http.StatusBadRequest, "Неверный запрос")
		return
	}
	uid := currentUID(r)

	grade := func(a *store.Attempt) (*store.Submission, error) {
		ev, err := s.evaluate(a)
		if err != nil {
			return nil, err
		}
		sub := &store.Submission{
			Code: a.Code, Kind: ev.outcome.Kind, Score: ev.outcome.Score, Total: ev.outcome.Total,
			Passed: ev.outcome.Passed,
		}
		if a.Kind == exam.KindSubject {
			sub.Section = a.Section
		}
		for _, h := range ev.outcome.Hits {
			sub.Hits = append(sub.Hits, store.TopicHit{Topic: clip(h.Topic, maxFieldLen), Correct: h.Correct, Section: h.Section})
		}
		return sub, nil
	}
	a, _, err := s.store.SubmitAttempt(r.Context(), id, uid, in.Answers, time.Now(), grade)
	if !s.attemptError(w, r, err) {
		return
	}
	ev, err := s.evaluate(a) // и для только что сданной, и для повторной сдачи — итог один и тот же
	if !s.attemptError(w, r, err) {
		return
	}
	u, err := s.store.LoadUser(r.Context(), uid)
	if err != nil {
		s.dbError(w, r, "загрузка пользователя", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": ev.outcome, "review": exam.Review(ev.qs), "user": u})
}

// attemptError переводит ошибки попыток в HTTP-ответы; false — ответ уже отправлен.
func (s *Server) attemptError(w http.ResponseWriter, r *http.Request, err error) bool {
	switch {
	case err == nil:
		return true
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "Попытка не найдена")
	case errors.Is(err, store.ErrAttemptExpired):
		writeError(w, http.StatusGone, "Время попытки истекло — начните тест заново")
	case errors.Is(err, exam.ErrBadAnswers):
		writeError(w, http.StatusBadRequest, "Некорректные ответы")
	case errors.Is(err, exam.ErrStale):
		writeError(w, http.StatusConflict, "Тест был обновлён — начните заново")
	case errors.Is(err, store.ErrTooManyResults):
		writeError(w, http.StatusBadRequest, "Достигнут лимит сохранённых результатов")
	default:
		s.dbError(w, r, "попытка", err)
	}
	return false
}

// GET /api/attempts/{id}/review — вопросы, ключи и ответы СДАННОЙ попытки (только владельцу).
func (s *Server) handleAttemptReview(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !attemptIDRe.MatchString(id) {
		writeError(w, http.StatusNotFound, "Попытка не найдена")
		return
	}
	a, err := s.store.GetAttempt(r.Context(), id, currentUID(r))
	if !s.attemptError(w, r, err) {
		return
	}
	if a.SubmittedAt == nil { // до сдачи ключи не раскрываются никому
		writeError(w, http.StatusConflict, "Разбор доступен после сдачи теста")
		return
	}
	ev, err := s.evaluate(a)
	if !s.attemptError(w, r, err) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id": a.ID, "kind": a.Kind, "code": a.Code, "section": a.Section, "lang": a.Lang, "title": a.Title,
		"submittedAt": a.SubmittedAt.UTC().Format(time.RFC3339),
		"questions":   exam.Public(ev.plan, ev.qs), "review": exam.Review(ev.qs),
		"answers": ev.answers, "result": ev.outcome,
	})
}
