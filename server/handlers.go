package main

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func decode(r *http.Request, v any) error {
	return json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(v)
}

// POST /api/auth/register
func handleRegister(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "Неверный запрос")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if in.Name == "" || in.Email == "" || len(in.Password) < 6 {
		writeError(w, http.StatusBadRequest, "Заполните имя, email и пароль (минимум 6 символов)")
		return
	}
	exists, err := emailExists(in.Email)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Ошибка сервера")
		return
	}
	if exists {
		writeError(w, http.StatusConflict, "Этот email уже зарегистрирован.")
		return
	}
	hash, err := hashPassword(in.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Ошибка сервера")
		return
	}
	id, err := createUser(in.Name, in.Email, hash)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать пользователя")
		return
	}
	respondAuth(w, id)
}

// POST /api/auth/login
func handleLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "Неверный запрос")
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	id, hash, err := getUserAuth(in.Email)
	if err != nil || !checkPassword(hash, in.Password) {
		writeError(w, http.StatusUnauthorized, "Неверный email или пароль.")
		return
	}
	respondAuth(w, id)
}

// GET /api/me
func handleMe(w http.ResponseWriter, r *http.Request) {
	u, err := loadUser(currentUID(r))
	if err != nil {
		writeError(w, http.StatusNotFound, "Пользователь не найден")
		return
	}
	writeJSON(w, http.StatusOK, u)
}

// PUT /api/profile
func handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	var p Profile
	if err := decode(r, &p); err != nil {
		writeError(w, http.StatusBadRequest, "Неверный запрос")
		return
	}
	p.FullName = strings.TrimSpace(p.FullName)
	p.Phone = strings.TrimSpace(p.Phone)
	p.Education = strings.TrimSpace(p.Education)
	p.City = strings.TrimSpace(p.City)
	if err := updateProfile(currentUID(r), p); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить профиль")
		return
	}
	handleMe(w, r)
}

// POST /api/favorites/toggle
func handleToggleFavorite(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code string `json:"code"`
	}
	if err := decode(r, &in); err != nil || strings.TrimSpace(in.Code) == "" {
		writeError(w, http.StatusBadRequest, "Не указан код направления")
		return
	}
	if err := toggleFavorite(currentUID(r), strings.TrimSpace(in.Code)); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить избранное")
		return
	}
	handleMe(w, r)
}

// GET /api/admin/users?key=... — список зарегистрированных (без паролей).
// Отключён, если не задан ADMIN_KEY.
func handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	if adminKey == "" {
		writeError(w, http.StatusForbidden, "Админ-доступ отключён: не задан ADMIN_KEY")
		return
	}
	if r.URL.Query().Get("key") != adminKey {
		writeError(w, http.StatusUnauthorized, "Неверный ключ")
		return
	}
	users, err := listUsers()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось прочитать список пользователей")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"count": len(users), "users": users})
}

// POST /api/results
func handleSaveResult(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code  string `json:"code"`
		Score int    `json:"score"`
		Total int    `json:"total"`
	}
	if err := decode(r, &in); err != nil || strings.TrimSpace(in.Code) == "" || in.Total <= 0 {
		writeError(w, http.StatusBadRequest, "Неверные данные результата")
		return
	}
	if in.Score < 0 {
		in.Score = 0
	}
	if in.Score > in.Total {
		in.Score = in.Total
	}
	if err := addResult(currentUID(r), strings.TrimSpace(in.Code), in.Score, in.Total); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось сохранить результат")
		return
	}
	handleMe(w, r)
}
