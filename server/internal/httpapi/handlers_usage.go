package httpapi

import (
	"net/http"
	"strconv"
	"time"
)

// refundWindowDays — срок, в течение которого возможен возврат, если доступ не использован.
// Должен совпадать с п. 7.2 оферты (docs/oferta-ru.md в репозитории продукта).
const refundWindowDays = 7

type usageEntry struct {
	Code           string `json:"code"`
	Language       string `json:"language"`
	HasAccess      bool   `json:"has_access"`
	GrantedAt      string `json:"granted_at"`
	ExpiresAt      string `json:"expires_at"`
	Used           bool   `json:"used"`
	FirstAt        string `json:"first_used_at"`
	LastAt         string `json:"last_used_at"`
	Attempts       int    `json:"attempts"`
	FirstKind      string `json:"first_kind"`
	FirstSection   string `json:"first_section"`
	FirstAttemptID string `json:"first_attempt_id"`
	FirstIP        string `json:"first_ip"`
	// RefundEligible — подсказка администратору: доступ не использован и срок возврата не вышел.
	// Окончательное решение остаётся за человеком (исключения оферты п. 7.4 здесь не учтены).
	RefundEligible bool   `json:"refund_eligible"`
	RefundUntil    string `json:"refund_until"`
}

// GET /api/admin/usage?user_id=N — доступы пользователя и журнал начала использования.
func (s *Server) handleAdminUsage(w http.ResponseWriter, r *http.Request) {
	uid, err := strconv.ParseInt(r.URL.Query().Get("user_id"), 10, 64)
	if err != nil || uid <= 0 {
		writeError(w, http.StatusBadRequest, "Неверный user_id")
		return
	}
	items, err := s.store.ListUsage(r.Context(), uid)
	if err != nil {
		s.dbError(w, r, "журнал использования", err)
		return
	}
	now := time.Now()
	out := make([]usageEntry, len(items))
	for i, it := range items {
		e := usageEntry{
			Code: it.Code, Language: it.Language, HasAccess: it.HasAccess, GrantedAt: it.GrantedAt, ExpiresAt: it.ExpiresAt,
			Used: it.FirstAt != "", FirstAt: it.FirstAt, LastAt: it.LastAt, Attempts: it.Attempts,
			FirstKind: it.FirstKind, FirstSection: it.FirstSection, FirstAttemptID: it.FirstAttemptID, FirstIP: it.FirstIP,
		}
		if g, err := time.Parse(time.RFC3339, it.GrantedAt); err == nil {
			until := g.AddDate(0, 0, refundWindowDays)
			e.RefundUntil = until.UTC().Format(time.RFC3339)
			e.RefundEligible = it.HasAccess && it.FirstAt == "" && now.Before(until)
		}
		out[i] = e
	}
	writeJSON(w, http.StatusOK, map[string]any{"user_id": uid, "refund_window_days": refundWindowDays, "items": out})
}
