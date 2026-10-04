package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"marshrut-api/internal/auth"
	"marshrut-api/internal/store"
)

// POST /api/auth/register — самрегистрация закрыта, аккаунты создаёт админ.
func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusForbidden, "Регистрация закрыта. Аккаунт выдаёт администратор.")
}

// Защита входа. Блокировка привязана к паре «логин + IP» (чужой перебор не
// выбивает настоящего студента) и, с высоким порогом, к самому логину
// (распределённый перебор). Счётчики ведутся по введённому логину независимо от
// того, существует ли он, поэтому по ответу нельзя определить наличие аккаунта.
const (
	loginPairMaxFails = 5
	loginAcctMaxFails = 50
	loginWindow       = 15 * time.Minute
	loginLockFor      = 15 * time.Minute

	msgBadCredentials = "Неверный email или пароль."
	msgLoginBlocked   = "Слишком много неудачных попыток входа. Попробуйте позже."
	msgUnavailable    = "Сервис временно недоступен"
)

func loginKeys(email, ip string) (pair, acct string) {
	return "p|" + email + "|" + ip, "a|" + email
}

// POST /api/auth/login
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decode(w, r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "Неверный запрос")
		return
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if len(email) > maxEmailLen {
		writeError(w, http.StatusUnauthorized, msgBadCredentials)
		return
	}
	ctx := r.Context()
	pair, acct := loginKeys(email, s.clientIP(r))

	locked, err := s.store.IsLocked(ctx, pair, acct)
	if err != nil {
		s.dbError(w, r, "проверка блокировки входа", err)
		return
	}
	if locked {
		writeError(w, http.StatusTooManyRequests, msgLoginBlocked)
		return
	}

	id, hash, err := s.store.UserAuth(ctx, email)
	switch {
	case errors.Is(err, store.ErrNotFound):
		auth.CheckPassword(s.dummyHash, in.Password) // то же время, что и для существующего логина
		s.recordLoginFailure(r, pair, acct)
		writeError(w, http.StatusUnauthorized, msgBadCredentials)
		return
	case err != nil:
		s.dbError(w, r, "поиск пользователя", err)
		return
	}
	if !auth.CheckPassword(hash, in.Password) {
		s.recordLoginFailure(r, pair, acct)
		writeError(w, http.StatusUnauthorized, msgBadCredentials)
		return
	}
	if err := s.store.ResetFailures(ctx, pair); err != nil {
		s.log.Warn("не удалось сбросить счётчик входа", "err", err)
	}
	s.respondAuth(w, r, id)
}

func (s *Server) recordLoginFailure(r *http.Request, pair, acct string) {
	ctx := r.Context()
	if err := s.store.RecordFailure(ctx, pair, loginPairMaxFails, loginWindow, loginLockFor); err != nil {
		s.log.Error("учёт неудачного входа", "err", err)
	}
	if err := s.store.RecordFailure(ctx, acct, loginAcctMaxFails, loginWindow, loginLockFor); err != nil {
		s.log.Error("учёт неудачного входа", "err", err)
	}
}

// respondAuth создаёт новую сессию (вытесняя предыдущую — один активный вход на
// аккаунт) и отдаёт {token, user}.
func (s *Server) respondAuth(w http.ResponseWriter, r *http.Request, uid int64) {
	sid := auth.RandString(16)
	if err := s.store.SetSessionID(r.Context(), uid, sid); err != nil {
		s.dbError(w, r, "начало сессии", err)
		return
	}
	s.sessions.Drop(uid)
	u, err := s.store.LoadUser(r.Context(), uid)
	if err != nil {
		s.dbError(w, r, "загрузка пользователя", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": s.signer.Make(uid, sid), "user": u})
}

// POST /api/auth/logout — обнуляет активную сессию на сервере, чтобы
// украденный/оставленный токен сразу переставал работать, а не жил до истечения TTL.
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	uid := currentUID(r)
	if err := s.store.SetSessionID(r.Context(), uid, auth.SentinelLoggedOut); err != nil {
		s.dbError(w, r, "завершение сессии", err)
		return
	}
	s.sessions.Drop(uid)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// dbError логирует сбой хранилища (с request_id) и отдаёт клиенту нейтральный ответ.
func (s *Server) dbError(w http.ResponseWriter, r *http.Request, what string, err error) {
	s.log.Error(what, "request_id", requestID(r.Context()), "err", err)
	status, msg := http.StatusInternalServerError, "Ошибка сервера"
	if r.Context().Err() != nil {
		status, msg = http.StatusServiceUnavailable, msgUnavailable
	}
	writeError(w, status, msg)
}

// GET /api/me
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	u, err := s.store.LoadUser(r.Context(), currentUID(r))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "Пользователь не найден")
		return
	}
	if err != nil {
		s.dbError(w, r, "загрузка пользователя", err)
		return
	}
	writeJSON(w, http.StatusOK, u)
}

// PUT /api/profile
func (s *Server) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	var p store.Profile
	if err := decode(w, r, &p); err != nil {
		writeError(w, http.StatusBadRequest, "Неверный запрос")
		return
	}
	p.FullName = clip(p.FullName, maxProfileFieldLen)
	p.Phone = clip(p.Phone, maxFieldLen)
	p.Education = clip(p.Education, maxProfileFieldLen)
	p.City = clip(p.City, maxFieldLen)
	p.Language = clip(p.Language, 20)
	p.TargetType = clip(p.TargetType, 20)
	for _, n := range []int{p.SpecialityID, p.ForeignScore, p.ProfileScore, p.BonusPoints} {
		if n < 0 || n > maxScore {
			writeError(w, http.StatusBadRequest, "Некорректные баллы или специальность")
			return
		}
	}
	// Аватар меняется отдельным запросом; тело профиля его не затрагивает.
	if err := s.store.UpdateProfile(r.Context(), currentUID(r), p); err != nil {
		s.dbError(w, r, "сохранение профиля", err)
		return
	}
	s.handleMe(w, r)
}

// PUT /api/profile/avatar {avatar: "data:image/jpeg;base64,..." | ""}
func (s *Server) handleSetAvatar(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Avatar string `json:"avatar"`
	}
	if err := decode(w, r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "Неверный запрос")
		return
	}
	if in.Avatar != "" {
		if !strings.HasPrefix(in.Avatar, "data:image/") {
			writeError(w, http.StatusBadRequest, "Ожидается изображение")
			return
		}
		if len(in.Avatar) > maxAvatarDataURLLen {
			writeError(w, http.StatusBadRequest, "Изображение слишком большое")
			return
		}
		if !validAvatar(in.Avatar) {
			writeError(w, http.StatusBadRequest, "Поддерживаются JPEG, PNG, WebP и GIF")
			return
		}
	}
	if err := s.store.SetAvatar(r.Context(), currentUID(r), in.Avatar); err != nil {
		s.dbError(w, r, "сохранение аватара", err)
		return
	}
	s.handleMe(w, r)
}

// POST /api/favorites/toggle
func (s *Server) handleToggleFavorite(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code string `json:"code"`
	}
	if err := decode(w, r, &in); err != nil || !validCode(strings.TrimSpace(in.Code)) {
		writeError(w, http.StatusBadRequest, "Не указан код направления")
		return
	}
	err := s.store.ToggleFavorite(r.Context(), currentUID(r), strings.TrimSpace(in.Code))
	if errors.Is(err, store.ErrTooManyFavorites) {
		writeError(w, http.StatusBadRequest, "Слишком много избранных направлений")
		return
	}
	if err != nil {
		s.dbError(w, r, "избранное", err)
		return
	}
	s.handleMe(w, r)
}
