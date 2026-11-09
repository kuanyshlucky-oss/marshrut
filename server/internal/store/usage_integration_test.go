//go:build integration

package store

import (
	"context"
	"testing"
)

func TestRecordUsageFirstAndRepeat(t *testing.T) {
	ctx := context.Background()
	st := newStore(t)
	uid := mustUser(t, st, "usage@e2e.kz")
	if err := st.GrantAccess(ctx, uid, "GOSSLUZHBA", "ru"); err != nil {
		t.Fatal(err)
	}

	items, err := st.ListUsage(ctx, uid)
	if err != nil || len(items) != 1 || !items[0].HasAccess || items[0].FirstAt != "" || items[0].Attempts != 0 {
		t.Fatalf("до использования: %+v, err=%v", items, err)
	}

	first, err := st.RecordUsage(ctx, uid, "GOSSLUZHBA", "ru", "att1", "subject", "subj1", "1.2.3.4")
	if err != nil || !first {
		t.Fatalf("первое использование: first=%v err=%v", first, err)
	}
	first, err = st.RecordUsage(ctx, uid, "GOSSLUZHBA", "ru", "att2", "subject", "subj2", "5.6.7.8")
	if err != nil || first {
		t.Fatalf("повторное использование: first=%v err=%v", first, err)
	}

	items, err = st.ListUsage(ctx, uid)
	if err != nil || len(items) != 1 {
		t.Fatalf("после использования: %+v, err=%v", items, err)
	}
	it := items[0]
	// Время, попытка, раздел и IP относятся к ПЕРВОМУ использованию и больше не меняются.
	if it.Attempts != 2 || it.FirstAttemptID != "att1" || it.FirstSection != "subj1" || it.FirstIP != "1.2.3.4" || it.FirstAt == "" {
		t.Errorf("журнал: %+v", it)
	}
}

func TestUsageSurvivesRevokeAndIsPerLanguage(t *testing.T) {
	ctx := context.Background()
	st := newStore(t)
	uid := mustUser(t, st, "revoke@e2e.kz")
	_ = st.GrantAccess(ctx, uid, "GOSSLUZHBA", "ru")
	_ = st.GrantAccess(ctx, uid, "GOSSLUZHBA", "kk")
	if _, err := st.RecordUsage(ctx, uid, "GOSSLUZHBA", "ru", "a", "subject", "subj1", "1.1.1.1"); err != nil {
		t.Fatal(err)
	}
	if err := st.RevokeAccess(ctx, uid, "GOSSLUZHBA", "ru"); err != nil {
		t.Fatal(err)
	}
	items, err := st.ListUsage(ctx, uid)
	if err != nil || len(items) != 2 {
		t.Fatalf("ждали 2 строки (ru из журнала, kk из доступа): %+v err=%v", items, err)
	}
	byLang := map[string]UsageItem{}
	for _, it := range items {
		byLang[it.Language] = it
	}
	if ru := byLang["ru"]; ru.HasAccess || ru.FirstAt == "" {
		t.Errorf("ru: доступ отозван, но журнал должен остаться: %+v", ru)
	}
	if kk := byLang["kk"]; !kk.HasAccess || kk.FirstAt != "" {
		t.Errorf("kk: язык не использован, использование ru не должно его задевать: %+v", kk)
	}
}
