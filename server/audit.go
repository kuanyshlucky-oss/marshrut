package main

import (
	"log"
	"net/http"
	"time"
)

// Журнал admin-действий: ADMIN_KEY общий на всех, поэтому единственный способ
// понять постфактум, кто и что сделал — писать след при каждом изменяющем
// запросе (создание/удаление аккаунта, сброс пароля, выдача/отзыв доступа).

func initAudit() error {
	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS admin_audit_log (
		id         BIGSERIAL PRIMARY KEY,
		action     TEXT NOT NULL,
		target     TEXT NOT NULL DEFAULT '',
		detail     TEXT NOT NULL DEFAULT '',
		actor_ip   TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`)
	return err
}

// logAdminAction пишет запись в журнал. Ошибка записи не должна ронять сам
// запрос (действие уже выполнено) — поэтому только логируем в stderr.
func logAdminAction(r *http.Request, action, target, detail string) {
	_, err := db.Exec(
		`INSERT INTO admin_audit_log(action, target, detail, actor_ip, created_at) VALUES($1, $2, $3, $4, $5)`,
		action, target, detail, clientIP(r), time.Now().UTC().Format(time.RFC3339),
	)
	if err != nil {
		log.Printf("не удалось записать audit-лог (action=%s target=%s): %v", action, target, err)
	}
}

type AuditEntry struct {
	ID        int64  `json:"id"`
	Action    string `json:"action"`
	Target    string `json:"target"`
	Detail    string `json:"detail"`
	ActorIP   string `json:"actor_ip"`
	CreatedAt string `json:"created_at"`
}

func listAuditLog(limit int) ([]AuditEntry, error) {
	rows, err := db.Query(
		`SELECT id, action, target, detail, actor_ip, created_at
		 FROM admin_audit_log ORDER BY id DESC LIMIT $1`, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []AuditEntry{}
	for rows.Next() {
		var e AuditEntry
		if err := rows.Scan(&e.ID, &e.Action, &e.Target, &e.Detail, &e.ActorIP, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// GET /api/admin/audit-log?key=... — последние 200 записей.
func handleAdminAuditLog(w http.ResponseWriter, r *http.Request) {
	if !adminGuard(w, r) {
		return
	}
	entries, err := listAuditLog(200)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось прочитать журнал")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
}
