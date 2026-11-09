//go:build integration

package httpapi

import (
	"strconv"
	"testing"
)

// Создание попытки по платному предмету пишет журнал; админ видит «использован» и
// подсказку о возврате меняется с «возможен» на «невозможен».
func TestUsageLogOnAttempt(t *testing.T) {
	e := newEnv(t)
	uid, email, pw := e.mkUser("Usage")
	tok := e.mustLogin(email, pw)
	e.grant(uid, "GOSSLUZHBA", "ru")

	usage := func() map[string]any {
		t.Helper()
		code, m := e.json("GET", "/api/admin/usage?user_id="+strconv.FormatInt(uid, 10), nil, admin())
		if code != 200 {
			t.Fatalf("admin/usage: %d %v", code, m)
		}
		items := m["items"].([]any)
		if len(items) != 1 {
			t.Fatalf("ждали 1 доступ: %v", items)
		}
		return items[0].(map[string]any)
	}

	before := usage()
	if before["used"] != false || before["refund_eligible"] != true {
		t.Fatalf("до использования: %v", before)
	}

	// Доступа к чужому тесту нет — попытка отклонена, журнал не пишется.
	if code, _, _ := e.newAttempt(tok, map[string]any{"kind": "subject", "code": "M150", "section": "subj1", "contentLang": "ru"}); code != 403 {
		t.Fatalf("попытка без доступа: %d, ждали 403", code)
	}
	if usage()["used"] != false {
		t.Fatal("отклонённая попытка попала в журнал")
	}

	a := e.mustAttempt(tok, map[string]any{"kind": "subject", "code": "GOSSLUZHBA", "section": "subj1", "contentLang": "ru"})
	after := usage()
	if after["used"] != true || after["refund_eligible"] != false || after["first_attempt_id"] != a.ID ||
		after["first_section"] != "subj1" || after["attempts"].(float64) != 1 {
		t.Fatalf("после использования: %v", after)
	}

	// Без админ-ключа журнал недоступен.
	if code, _ := e.json("GET", "/api/admin/usage?user_id="+strconv.FormatInt(uid, 10), nil); code == 200 {
		t.Error("журнал отдан без админ-ключа")
	}
	if code, _ := e.json("GET", "/api/admin/usage?user_id=abc", nil, admin()); code != 400 {
		t.Errorf("кривой user_id: %d, ждали 400", code)
	}
}
