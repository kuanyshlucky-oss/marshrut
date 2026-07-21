package main

import (
	"net/http"
	"time"
)

// Доступ к тестам выдаётся вручную администратором на весь код направления
// целиком (без деления по предметам) — булево «выдан/не выдан», без срока
// действия. Контент вопросов (content.go) отдаётся только тем, у кого есть
// строка в этой таблице.

func initAccess() error {
	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS test_access (
		user_id    BIGINT NOT NULL,
		code       TEXT NOT NULL,
		granted_at TEXT NOT NULL,
		UNIQUE(user_id, code)
	)`)
	return err
}

func grantAccess(userID int64, code string) error {
	_, err := db.Exec(
		`INSERT INTO test_access(user_id, code, granted_at) VALUES($1, $2, $3)
		 ON CONFLICT (user_id, code) DO NOTHING`,
		userID, code, time.Now().UTC().Format(time.RFC3339),
	)
	return err
}

func revokeAccess(userID int64, code string) error {
	_, err := db.Exec(`DELETE FROM test_access WHERE user_id = $1 AND code = $2`, userID, code)
	return err
}

func userHasAccess(userID int64, code string) (bool, error) {
	var n int
	err := db.QueryRow(`SELECT COUNT(1) FROM test_access WHERE user_id = $1 AND code = $2`, userID, code).Scan(&n)
	return n > 0, err
}

// --- Хендлеры ---

// GET /api/tests/{code} — контент теста, только для тех, у кого есть доступ.
func handleGetTestContent(w http.ResponseWriter, r *http.Request) {
	code := r.PathValue("code")
	if code == "" {
		writeError(w, http.StatusBadRequest, "Не указан код направления")
		return
	}
	ok, err := userHasAccess(currentUID(r), code)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Ошибка проверки доступа")
		return
	}
	if !ok {
		writeError(w, http.StatusForbidden, "Нет доступа к этому тесту — обратитесь к администратору для получения доступа")
		return
	}
	b, found := testContentBytes(code)
	if !found {
		writeError(w, http.StatusNotFound, "Тест не найден")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(b)
}

// GET /api/admin/test-codes?key=... — список тестов (код + название), у которых
// вообще есть контент, для выпадающего списка в админке.
func handleAdminTestCodes(w http.ResponseWriter, r *http.Request) {
	if !adminGuard(w, r) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tests": listContentInfo()})
}

// POST /api/admin/grant-access?key=... {user_id, code}
func handleAdminGrantAccess(w http.ResponseWriter, r *http.Request) {
	if !adminGuard(w, r) {
		return
	}
	var body struct {
		UserID int64  `json:"user_id"`
		Code   string `json:"code"`
	}
	if err := decode(r, &body); err != nil || body.UserID == 0 || body.Code == "" {
		writeError(w, http.StatusBadRequest, "Некорректный запрос")
		return
	}
	if _, found := testContentBytes(body.Code); !found {
		writeError(w, http.StatusBadRequest, "Такого кода теста не существует")
		return
	}
	if err := grantAccess(body.UserID, body.Code); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось выдать доступ")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// POST /api/admin/revoke-access?key=... {user_id, code}
func handleAdminRevokeAccess(w http.ResponseWriter, r *http.Request) {
	if !adminGuard(w, r) {
		return
	}
	var body struct {
		UserID int64  `json:"user_id"`
		Code   string `json:"code"`
	}
	if err := decode(r, &body); err != nil || body.UserID == 0 || body.Code == "" {
		writeError(w, http.StatusBadRequest, "Некорректный запрос")
		return
	}
	if err := revokeAccess(body.UserID, body.Code); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось отозвать доступ")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
