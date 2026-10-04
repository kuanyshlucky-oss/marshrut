package httpapi

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"marshrut-api/internal/auth"
	"marshrut-api/internal/store"
)

// Обработчики админки. Защита (IP-фильтр, лимит, ключ) — в s.admin(...);
// каждое изменяющее действие пишется в audit-лог.

// GET /api/admin/users — список пользователей (без паролей).
func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.store.ListUsers(r.Context())
	if err != nil {
		s.dbError(w, r, "список пользователей", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"count": len(users), "users": users})
}

// POST /api/admin/create-user — логин и пароль генерируются, если не заданы явно
// (админ может вписать свои, если клиент попросил конкретный).
func (s *Server) handleAdminCreate(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	_ = decode(w, r, &in)
	name := clip(in.Name, maxProfileFieldLen)
	email := strings.ToLower(strings.TrimSpace(in.Email)) // логин регистронезависим (вход приводит к нижнему)
	password := strings.TrimSpace(in.Password)
	if email == "" {
		email = auth.GenLogin()
	}
	if len(email) > maxEmailLen {
		writeError(w, http.StatusBadRequest, "Логин слишком длинный")
		return
	}
	if password != "" && len(password) < minAdminPasswordLen {
		writeError(w, http.StatusBadRequest, "Пароль слишком короткий — минимум 8 символов")
		return
	}
	if len(password) > auth.MaxPasswordLen {
		writeError(w, http.StatusBadRequest, "Пароль слишком длинный — максимум 72 байта")
		return
	}
	if name == "" {
		name = email
	}
	pw := password
	if pw == "" {
		pw = auth.GenPassword()
	}
	hash, err := auth.HashPassword(pw)
	if err != nil {
		s.dbError(w, r, "хеширование пароля", err)
		return
	}
	id, err := s.store.CreateUser(r.Context(), name, email, hash)
	if errors.Is(err, store.ErrEmailTaken) {
		writeError(w, http.StatusConflict, "Такой логин уже есть — попробуйте ещё раз")
		return
	}
	if err != nil {
		s.dbError(w, r, "создание аккаунта", err)
		return
	}
	s.audit(r, "create_user", email, "name="+name)
	// пароль отдаётся ОДИН раз — сохранить/передать клиенту
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "name": name, "login": email, "password": pw})
}

// userIDBody разбирает {id} и отвечает 400, если его нет.
func userIDBody(w http.ResponseWriter, r *http.Request) (int64, bool) {
	var in struct {
		ID int64 `json:"id"`
	}
	if err := decode(w, r, &in); err != nil || in.ID <= 0 {
		writeError(w, http.StatusBadRequest, "Не указан id")
		return 0, false
	}
	return in.ID, true
}

// POST /api/admin/delete-user {id}
func (s *Server) handleAdminDelete(w http.ResponseWriter, r *http.Request) {
	id, ok := userIDBody(w, r)
	if !ok {
		return
	}
	err := s.store.DeleteUser(r.Context(), id)
	s.sessions.Drop(id)
	if err != nil {
		s.dbError(w, r, "удаление пользователя", err)
		return
	}
	s.audit(r, "delete_user", strconv.FormatInt(id, 10), "")
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/admin/reset-progress {id} — очищает результаты и статистику по темам,
// не трогая аккаунт.
func (s *Server) handleAdminResetProgress(w http.ResponseWriter, r *http.Request) {
	id, ok := userIDBody(w, r)
	if !ok {
		return
	}
	if err := s.store.ResetProgress(r.Context(), id); err != nil {
		s.dbError(w, r, "сброс прогресса", err)
		return
	}
	s.audit(r, "reset_progress", strconv.FormatInt(id, 10), "")
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/admin/reset-password {id} — новый пароль, показывается один раз.
// Заодно завершает активную сессию: тот, кто знал старый пароль, теряет доступ сразу.
func (s *Server) handleAdminResetPassword(w http.ResponseWriter, r *http.Request) {
	id, ok := userIDBody(w, r)
	if !ok {
		return
	}
	pw := auth.GenPassword()
	hash, err := auth.HashPassword(pw)
	if err != nil {
		s.dbError(w, r, "хеширование пароля", err)
		return
	}
	err = s.store.SetPasswordHash(r.Context(), id, hash)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "Пользователь не найден")
		return
	}
	if err != nil {
		s.dbError(w, r, "сброс пароля", err)
		return
	}
	if err := s.store.SetSessionID(r.Context(), id, auth.SentinelLoggedOut); err != nil {
		s.log.Error("не удалось завершить сессию после сброса пароля", "user_id", id, "err", err)
	}
	s.sessions.Drop(id)
	s.audit(r, "reset_password", strconv.FormatInt(id, 10), "")
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "password": pw})
}

// GET /api/admin/test-codes — тесты (код + язык + название), у которых есть контент.
func (s *Server) handleAdminTestCodes(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"tests": s.content.Infos()})
}

type accessBody struct {
	UserID   int64  `json:"user_id"`
	Code     string `json:"code"`
	Language string `json:"language"`
}

func decodeAccess(w http.ResponseWriter, r *http.Request) (accessBody, string, bool) {
	var b accessBody
	if err := decode(w, r, &b); err != nil || b.UserID <= 0 || !validCode(b.Code) {
		writeError(w, http.StatusBadRequest, "Некорректный запрос")
		return b, "", false
	}
	return b, normalizeLang(b.Language), true
}

// POST /api/admin/grant-access {user_id, code, language}
func (s *Server) handleAdminGrantAccess(w http.ResponseWriter, r *http.Request) {
	b, lang, ok := decodeAccess(w, r)
	if !ok {
		return
	}
	if !s.content.Has(b.Code, lang) {
		writeError(w, http.StatusBadRequest, "Такого теста на этом языке не существует")
		return
	}
	if err := s.store.GrantAccess(r.Context(), b.UserID, b.Code, lang); err != nil {
		s.dbError(w, r, "выдача доступа", err)
		return
	}
	s.audit(r, "grant_access", b.Code+" ("+lang+")", "user_id="+strconv.FormatInt(b.UserID, 10))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// POST /api/admin/revoke-access {user_id, code, language}
func (s *Server) handleAdminRevokeAccess(w http.ResponseWriter, r *http.Request) {
	b, lang, ok := decodeAccess(w, r)
	if !ok {
		return
	}
	if err := s.store.RevokeAccess(r.Context(), b.UserID, b.Code, lang); err != nil {
		s.dbError(w, r, "отзыв доступа", err)
		return
	}
	s.audit(r, "revoke_access", b.Code+" ("+lang+")", "user_id="+strconv.FormatInt(b.UserID, 10))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// GET /api/admin/audit-log — последние 200 действий.
func (s *Server) handleAdminAuditLog(w http.ResponseWriter, r *http.Request) {
	entries, err := s.store.ListAudit(r.Context(), 200)
	if err != nil {
		s.dbError(w, r, "журнал", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
}
