package main

import (
	"net/http"
	"strconv"
	"time"
)

// Доступ к тестам выдаётся вручную администратором на весь код направления
// целиком (без деления по предметам) — булево «выдан/не выдан», без срока
// действия. Контент вопросов (content.go) отдаётся только тем, у кого есть
// строка в этой таблице. С появлением казахских тестов доступ выдаётся
// отдельно на каждый язык одного и того же направления (см. ТЗ: кнопки
// «Доступ RU» / «Доступ KZ» в админке) — язык хранится отдельной колонкой,
// а не зашит в код направления, чтобы его можно было фильтровать/агрегировать
// в отчётах.

// normalizeLang приводит вход (query-параметр или тело запроса) к одному из
// двух внутренних значений. "kz" принимается как синоним "kk" — в ТЗ и
// разговоре использовали "kz" (код страны), а остальной код проекта (i18n.js,
// дорожная карта) уже везде использует ISO-код языка "kk" — не плодим два
// разных обозначения одного и того же в БД.
func normalizeLang(s string) string {
	if s == "kk" || s == "kz" {
		return "kk"
	}
	return "ru"
}

func initAccess() error {
	if _, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS test_access (
		user_id    BIGINT NOT NULL,
		code       TEXT NOT NULL,
		language   TEXT NOT NULL DEFAULT 'ru',
		granted_at TEXT NOT NULL,
		UNIQUE(user_id, code, language)
	)`); err != nil {
		return err
	}
	// Миграция для БД, где таблица была создана до появления языка тестов
	// (раньше уникальность была по (user_id, code) без языка).
	if _, err := db.Exec(`ALTER TABLE test_access ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'ru'`); err != nil {
		return err
	}
	if _, err := db.Exec(`ALTER TABLE test_access DROP CONSTRAINT IF EXISTS test_access_user_id_code_key`); err != nil {
		return err
	}
	// Postgres репортит "уже существует" для добавляемого constraint'а то как
	// duplicate_object (42710), то — поскольку у именованного UNIQUE-ограничения
	// под капотом одноимённый индекс — как duplicate_table (42P07). Ловим оба,
	// иначе после первого успешного деплоя сервер падает на каждом следующем
	// старте (constraint уже есть, а мы это не предвидели — ровно так и было).
	_, err := db.Exec(`
	DO $$ BEGIN
		ALTER TABLE test_access ADD CONSTRAINT test_access_user_id_code_language_key UNIQUE(user_id, code, language);
	EXCEPTION
		WHEN duplicate_object THEN NULL;
		WHEN duplicate_table THEN NULL;
	END $$`)
	return err
}

func grantAccess(userID int64, code, language string) error {
	_, err := db.Exec(
		`INSERT INTO test_access(user_id, code, language, granted_at) VALUES($1, $2, $3, $4)
		 ON CONFLICT (user_id, code, language) DO NOTHING`,
		userID, code, language, time.Now().UTC().Format(time.RFC3339),
	)
	return err
}

func revokeAccess(userID int64, code, language string) error {
	_, err := db.Exec(`DELETE FROM test_access WHERE user_id = $1 AND code = $2 AND language = $3`, userID, code, language)
	return err
}

func userHasAccess(userID int64, code, language string) (bool, error) {
	var n int
	err := db.QueryRow(`SELECT COUNT(1) FROM test_access WHERE user_id = $1 AND code = $2 AND language = $3`, userID, code, language).Scan(&n)
	return n > 0, err
}

// --- Хендлеры ---

// GET /api/tests/{code}?lang=kk — контент теста, только для тех, у кого есть
// доступ именно на этот язык. lang по умолчанию "ru" (см. normalizeLang).
func handleGetTestContent(w http.ResponseWriter, r *http.Request) {
	code := r.PathValue("code")
	if code == "" {
		writeError(w, http.StatusBadRequest, "Не указан код направления")
		return
	}
	lang := normalizeLang(r.URL.Query().Get("lang"))
	ok, err := userHasAccess(currentUID(r), code, lang)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Ошибка проверки доступа")
		return
	}
	if !ok {
		writeError(w, http.StatusForbidden, "Нет доступа к этому тесту — обратитесь к администратору для получения доступа")
		return
	}
	b, found := testContentBytes(code, lang)
	if !found {
		writeError(w, http.StatusNotFound, "Тест не найден")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(b)
}

// GET /api/admin/test-codes?key=... — список тестов (код + язык + название),
// у которых вообще есть контент, для админки (выдача доступа по направлению
// и языку).
func handleAdminTestCodes(w http.ResponseWriter, r *http.Request) {
	if !adminGuard(w, r) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tests": listContentInfo()})
}

// POST /api/admin/grant-access?key=... {user_id, code, language}
func handleAdminGrantAccess(w http.ResponseWriter, r *http.Request) {
	if !adminGuard(w, r) {
		return
	}
	var body struct {
		UserID   int64  `json:"user_id"`
		Code     string `json:"code"`
		Language string `json:"language"`
	}
	if err := decode(r, &body); err != nil || body.UserID == 0 || body.Code == "" {
		writeError(w, http.StatusBadRequest, "Некорректный запрос")
		return
	}
	lang := normalizeLang(body.Language)
	if _, found := testContentBytes(body.Code, lang); !found {
		writeError(w, http.StatusBadRequest, "Такого теста на этом языке не существует")
		return
	}
	if err := grantAccess(body.UserID, body.Code, lang); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось выдать доступ")
		return
	}
	logAdminAction(r, "grant_access", body.Code+" ("+lang+")", "user_id="+strconv.FormatInt(body.UserID, 10))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// POST /api/admin/revoke-access?key=... {user_id, code, language}
func handleAdminRevokeAccess(w http.ResponseWriter, r *http.Request) {
	if !adminGuard(w, r) {
		return
	}
	var body struct {
		UserID   int64  `json:"user_id"`
		Code     string `json:"code"`
		Language string `json:"language"`
	}
	if err := decode(r, &body); err != nil || body.UserID == 0 || body.Code == "" {
		writeError(w, http.StatusBadRequest, "Некорректный запрос")
		return
	}
	lang := normalizeLang(body.Language)
	if err := revokeAccess(body.UserID, body.Code, lang); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось отозвать доступ")
		return
	}
	logAdminAction(r, "revoke_access", body.Code+" ("+lang+")", "user_id="+strconv.FormatInt(body.UserID, 10))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
