//go:build integration

package store

import (
	"context"
	"testing"
	"time"
)

func TestAdminExtras(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	id, err := st.CreateUser(ctx, "u", "u@x", "hash")
	if err != nil {
		t.Fatal(err)
	}

	// срок доступа: бессрочный и истёкший
	if err := st.GrantAccessUntil(ctx, id, "M019", "ru", ""); err != nil {
		t.Fatal(err)
	}
	if ok, _ := st.HasAccess(ctx, id, "M019", "ru"); !ok {
		t.Fatal("бессрочный доступ должен работать")
	}
	past := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
	if err := st.GrantAccessUntil(ctx, id, "M019", "ru", past); err != nil {
		t.Fatal(err)
	}
	if ok, _ := st.HasAccess(ctx, id, "M019", "ru"); ok {
		t.Fatal("истёкший доступ не должен работать")
	}
	if ok, _ := st.HasAnyAccess(ctx, id, "M019"); ok {
		t.Fatal("HasAnyAccess: истёкший доступ не должен работать")
	}
	future := time.Now().UTC().AddDate(0, 0, 5).Format("2006-01-02")
	if err := st.GrantAccessUntil(ctx, id, "M019", "ru", future); err != nil {
		t.Fatal(err)
	}
	if ok, _ := st.HasAccess(ctx, id, "M019", "ru"); !ok {
		t.Fatal("доступ с будущим сроком должен работать (продление)")
	}
	u, err := st.LoadUser(ctx, id)
	if err != nil || len(u.Access) != 1 {
		t.Fatalf("LoadUser access = %v, %v", u, err)
	}

	// блокировка, заметка, вход
	if err := st.SetBlocked(ctx, id, true); err != nil {
		t.Fatal(err)
	}
	if b, _ := st.IsBlocked(ctx, id); !b {
		t.Fatal("ожидалась блокировка")
	}
	if err := st.SetNote(ctx, id, "оплатил"); err != nil {
		t.Fatal(err)
	}
	if err := st.TouchLogin(ctx, id); err != nil {
		t.Fatal(err)
	}
	if err := st.SetNote(ctx, 99999, "x"); err != ErrNotFound {
		t.Fatalf("несуществующий пользователь: %v", err)
	}
	list, err := st.ListUsers(ctx)
	if err != nil || len(list) != 1 {
		t.Fatal(err, list)
	}
	au := list[0]
	if !au.Blocked || au.Note != "оплатил" || au.LastLoginAt == "" || au.Access[0].ExpiresAt != future {
		t.Fatalf("ListUsers: %+v", au)
	}

	// баннер
	if err := st.SetBanner(ctx, Banner{Text: "привет", Kind: "warn", Active: true}); err != nil {
		t.Fatal(err)
	}
	if b, _ := st.GetBanner(ctx); !b.Active || b.Text != "привет" || b.Kind != "warn" {
		t.Fatalf("banner = %+v", b)
	}

	// пометки вопросов: повторная пометка открытого вопроса обновляет заметку, а не плодит дубли
	for _, note := range []string{"a", "b"} {
		if err := st.AddFlag(ctx, "c/logic", 3, "вопрос", note); err != nil {
			t.Fatal(err)
		}
	}
	fl, _ := st.ListFlags(ctx)
	if len(fl) != 1 || fl[0].Note != "b" {
		t.Fatalf("flags = %+v", fl)
	}
	if err := st.ResolveFlag(ctx, fl[0].ID, true); err != nil {
		t.Fatal(err)
	}
	if err := st.AddFlag(ctx, "c/logic", 3, "вопрос", "again"); err != nil {
		t.Fatal(err)
	}
	if fl, _ = st.ListFlags(ctx); len(fl) != 2 {
		t.Fatalf("после решения можно пометить снова: %+v", fl)
	}
}
