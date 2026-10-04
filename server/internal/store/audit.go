package store

import (
	"context"
	"time"
)

// LogAdmin пишет запись в журнал админ-действий.
func (s *Store) LogAdmin(ctx context.Context, action, target, detail, actorIP string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO admin_audit_log(action, target, detail, actor_ip, created_at) VALUES($1, $2, $3, $4, $5)`,
		action, target, detail, actorIP, time.Now().UTC().Format(time.RFC3339),
	)
	return err
}

func (s *Store) ListAudit(ctx context.Context, limit int) ([]AuditEntry, error) {
	rows, err := s.db.QueryContext(ctx,
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
