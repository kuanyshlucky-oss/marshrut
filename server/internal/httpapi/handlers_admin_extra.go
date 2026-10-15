package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"marshrut-api/internal/auth"
	"marshrut-api/internal/exam"
	"marshrut-api/internal/store"
)

// Дополнительные функции админки: массовые операции, заметки,
// блокировка, баннер, аналитика, пометки вопросов.

const (
	maxBulkCreate = 100
	maxBulkUsers  = 500
	maxNoteLen    = 500
	maxBannerLen  = 400
)

func (s *Server) adminUserError(w http.ResponseWriter, r *http.Request, what string, err error) bool {
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "Пользователь не найден")
		return false
	}
	if err != nil {
		s.dbError(w, r, what, err)
		return false
	}
	return true
}

// POST /api/admin/bulk-create {count, prefix} — пачка аккаунтов со сгенерированными
// логинами и паролями; пароли отдаются один раз.
func (s *Server) handleAdminBulkCreate(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Count  int    `json:"count"`
		Prefix string `json:"prefix"`
	}
	if err := decode(w, r, &in); err != nil || in.Count < 1 || in.Count > maxBulkCreate {
		writeError(w, http.StatusBadRequest, "Количество — от 1 до "+strconv.Itoa(maxBulkCreate))
		return
	}
	prefix := strings.ToLower(clip(in.Prefix, 20))
	type created struct {
		ID       int64  `json:"id"`
		Login    string `json:"login"`
		Password string `json:"password"`
	}
	out := make([]created, 0, in.Count)
	for len(out) < in.Count {
		login := prefix + auth.GenLogin()
		pw := auth.GenPassword()
		hash, err := auth.HashPassword(pw)
		if err != nil {
			s.dbError(w, r, "хеширование пароля", err)
			return
		}
		id, err := s.store.CreateUser(r.Context(), login, login, hash)
		if errors.Is(err, store.ErrEmailTaken) {
			continue
		}
		if err != nil {
			s.dbError(w, r, "создание аккаунта", err)
			return
		}
		out = append(out, created{id, login, pw})
	}
	s.audit(r, "bulk_create", strconv.Itoa(len(out)), "prefix="+prefix)
	writeJSON(w, http.StatusOK, map[string]any{"accounts": out})
}

// expiryFromDays — дата окончания доступа (UTC, включительно) или "" для бессрочного.
func expiryFromDays(days int) string {
	if days <= 0 {
		return ""
	}
	return time.Now().UTC().AddDate(0, 0, days).Format("2006-01-02")
}

// POST /api/admin/bulk-access {user_ids, code, language, days, revoke}
func (s *Server) handleAdminBulkAccess(w http.ResponseWriter, r *http.Request) {
	var in struct {
		UserIDs  []int64 `json:"user_ids"`
		Code     string  `json:"code"`
		Language string  `json:"language"`
		Days     int     `json:"days"`
		Revoke   bool    `json:"revoke"`
	}
	if err := decode(w, r, &in); err != nil || len(in.UserIDs) == 0 || len(in.UserIDs) > maxBulkUsers ||
		!validCode(in.Code) || in.Days < 0 || in.Days > 3650 {
		writeError(w, http.StatusBadRequest, "Некорректный запрос")
		return
	}
	lang := normalizeLang(in.Language)
	if !in.Revoke && !s.content.Has(in.Code, lang) {
		writeError(w, http.StatusBadRequest, "Такого теста на этом языке не существует")
		return
	}
	exp := expiryFromDays(in.Days)
	for _, id := range in.UserIDs {
		var err error
		if in.Revoke {
			err = s.store.RevokeAccess(r.Context(), id, in.Code, lang)
		} else {
			err = s.store.GrantAccessUntil(r.Context(), id, in.Code, lang, exp)
		}
		if err != nil {
			s.dbError(w, r, "массовый доступ", err)
			return
		}
	}
	action := "bulk_grant"
	if in.Revoke {
		action = "bulk_revoke"
	}
	s.audit(r, action, in.Code+" ("+lang+")", "users="+strconv.Itoa(len(in.UserIDs))+" until="+exp)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "count": len(in.UserIDs), "expires_at": exp})
}

// POST /api/admin/set-note {id, note}
func (s *Server) handleAdminSetNote(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ID   int64  `json:"id"`
		Note string `json:"note"`
	}
	if err := decode(w, r, &in); err != nil || in.ID <= 0 {
		writeError(w, http.StatusBadRequest, "Не указан id")
		return
	}
	if !s.adminUserError(w, r, "заметка", s.store.SetNote(r.Context(), in.ID, clip(in.Note, maxNoteLen))) {
		return
	}
	s.audit(r, "set_note", strconv.FormatInt(in.ID, 10), "")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// dropSession завершает активную сессию пользователя (токен перестаёт работать сразу).
func (s *Server) dropSession(r *http.Request, id int64) error {
	err := s.store.SetSessionID(r.Context(), id, auth.SentinelLoggedOut)
	s.sessions.Drop(id)
	return err
}

// POST /api/admin/set-blocked {id, blocked}
func (s *Server) handleAdminSetBlocked(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ID      int64 `json:"id"`
		Blocked bool  `json:"blocked"`
	}
	if err := decode(w, r, &in); err != nil || in.ID <= 0 {
		writeError(w, http.StatusBadRequest, "Не указан id")
		return
	}
	if !s.adminUserError(w, r, "блокировка", s.store.SetBlocked(r.Context(), in.ID, in.Blocked)) {
		return
	}
	if in.Blocked {
		if err := s.dropSession(r, in.ID); err != nil {
			s.log.Error("не удалось завершить сессию при блокировке", "user_id", in.ID, "err", err)
		}
	}
	act := "unblock_user"
	if in.Blocked {
		act = "block_user"
	}
	s.audit(r, act, strconv.FormatInt(in.ID, 10), "")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// POST /api/admin/end-session {id}
func (s *Server) handleAdminEndSession(w http.ResponseWriter, r *http.Request) {
	id, ok := userIDBody(w, r)
	if !ok {
		return
	}
	if err := s.dropSession(r, id); err != nil {
		s.dbError(w, r, "завершение сессии", err)
		return
	}
	s.audit(r, "end_session", strconv.FormatInt(id, 10), "")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// GET /api/admin/user-topics?id= — статистика по темам одного пользователя.
func (s *Server) handleAdminUserTopics(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.URL.Query().Get("id"), 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "Не указан id")
		return
	}
	rows, err := s.store.UserTopics(r.Context(), id)
	if err != nil {
		s.dbError(w, r, "темы пользователя", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"topics": rows})
}

type hardQuestion struct {
	Bank     string  `json:"bank"`
	Idx      int     `json:"idx"`
	Question string  `json:"question"`
	Topic    string  `json:"topic"`
	Attempts int     `json:"attempts"`
	Wrong    int     `json:"wrong"`
	Rate     float64 `json:"wrong_rate"`
}

// GET /api/admin/hard-questions — вопросы с наибольшей долей неверных ответов
// (по последним сданным попыткам, не меньше 3 ответов на вопрос).
func (s *Server) handleAdminHardQuestions(w http.ResponseWriter, r *http.Request) {
	attempts, err := s.store.SubmittedAttempts(r.Context(), 3000)
	if err != nil {
		s.dbError(w, r, "сложные вопросы", err)
		return
	}
	type key struct {
		bank string
		idx  int
	}
	type acc struct{ n, wrong int }
	agg := map[key]*acc{}
	for _, a := range attempts {
		var refs []exam.Ref
		var answers []exam.Answer
		if json.Unmarshal(a.Items, &refs) != nil || json.Unmarshal(a.Answers, &answers) != nil || len(refs) != len(answers) {
			continue
		}
		qs, err := exam.Resolve(s.content, refs)
		if err != nil {
			continue // банк изменился после попытки
		}
		for i, q := range qs {
			k := key{refs[i].Bank, refs[i].Idx}
			c := agg[k]
			if c == nil {
				c = &acc{}
				agg[k] = c
			}
			c.n++
			if !exam.IsCorrect(q, answers[i]) {
				c.wrong++
			}
		}
	}
	out := []hardQuestion{}
	for k, c := range agg {
		if c.n < 3 {
			continue
		}
		b, ok := s.content.Bank(k.bank)
		if !ok || k.idx >= len(b.Questions) {
			continue
		}
		q := b.Questions[k.idx]
		out = append(out, hardQuestion{Bank: k.bank, Idx: k.idx, Question: clip(q.Q, 200), Topic: q.Topic,
			Attempts: c.n, Wrong: c.wrong, Rate: float64(c.wrong) / float64(c.n)})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Rate != out[j].Rate {
			return out[i].Rate > out[j].Rate
		}
		return out[i].Attempts > out[j].Attempts
	})
	if len(out) > 60 {
		out = out[:60]
	}
	writeJSON(w, http.StatusOK, map[string]any{"questions": out, "attempts_scanned": len(attempts)})
}

// GET /api/admin/banks — сводка по банкам вопросов.
func (s *Server) handleAdminBanks(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"banks": s.content.BankStats()})
}

// GET /api/banner — публичный баннер (если включён).
func (s *Server) handleBanner(w http.ResponseWriter, r *http.Request) {
	b, err := s.store.GetBanner(r.Context())
	if err != nil {
		s.dbError(w, r, "баннер", err)
		return
	}
	if !b.Active || b.Text == "" {
		writeJSON(w, http.StatusOK, map[string]any{"active": false})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"active": true, "text": b.Text, "kind": b.Kind})
}

// GET /api/admin/banner
func (s *Server) handleAdminGetBanner(w http.ResponseWriter, r *http.Request) {
	b, err := s.store.GetBanner(r.Context())
	if err != nil {
		s.dbError(w, r, "баннер", err)
		return
	}
	writeJSON(w, http.StatusOK, b)
}

// POST /api/admin/banner {text, kind, active}
func (s *Server) handleAdminSetBanner(w http.ResponseWriter, r *http.Request) {
	var in store.Banner
	if err := decode(w, r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "Неверный запрос")
		return
	}
	in.Text = clip(in.Text, maxBannerLen)
	if in.Kind != "warn" {
		in.Kind = "info"
	}
	if err := s.store.SetBanner(r.Context(), in); err != nil {
		s.dbError(w, r, "баннер", err)
		return
	}
	s.audit(r, "set_banner", "", "active="+strconv.FormatBool(in.Active))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// GET /api/admin/flags
func (s *Server) handleAdminFlags(w http.ResponseWriter, r *http.Request) {
	fl, err := s.store.ListFlags(r.Context())
	if err != nil {
		s.dbError(w, r, "пометки вопросов", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"flags": fl})
}

// POST /api/admin/flag-question {bank, idx, note}
func (s *Server) handleAdminFlagQuestion(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Bank string `json:"bank"`
		Idx  int    `json:"idx"`
		Note string `json:"note"`
	}
	if err := decode(w, r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "Неверный запрос")
		return
	}
	b, ok := s.content.Bank(in.Bank)
	if !ok || in.Idx < 0 || in.Idx >= len(b.Questions) {
		writeError(w, http.StatusBadRequest, "Такого вопроса нет")
		return
	}
	if err := s.store.AddFlag(r.Context(), in.Bank, in.Idx, clip(b.Questions[in.Idx].Q, 300), clip(in.Note, maxNoteLen)); err != nil {
		s.dbError(w, r, "пометка вопроса", err)
		return
	}
	s.audit(r, "flag_question", in.Bank+"#"+strconv.Itoa(in.Idx), "")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// POST /api/admin/resolve-flag {id, resolved}
func (s *Server) handleAdminResolveFlag(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ID       int64 `json:"id"`
		Resolved bool  `json:"resolved"`
	}
	if err := decode(w, r, &in); err != nil || in.ID <= 0 {
		writeError(w, http.StatusBadRequest, "Не указан id")
		return
	}
	if err := s.store.ResolveFlag(r.Context(), in.ID, in.Resolved); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "Пометка не найдена")
			return
		}
		s.dbError(w, r, "пометка вопроса", err)
		return
	}
	s.audit(r, "resolve_flag", strconv.FormatInt(in.ID, 10), "resolved="+strconv.FormatBool(in.Resolved))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
