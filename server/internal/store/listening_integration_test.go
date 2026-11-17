//go:build integration

package store

import (
	"context"
	"testing"
)

func TestListeningProgress(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	u1 := mustUser(t, st, "lis1@x.kz")
	u2 := mustUser(t, st, "lis2@x.kz")

	if p, err := st.ListeningProgress(ctx, u1); err != nil || len(p) != 0 {
		t.Fatalf("пустой прогресс: %v %v", p, err)
	}
	// три прохождения: 40, 90, 70 — best = 90, last = 70, tries = 3
	for _, sc := range []int{40, 90, 70} {
		if err := st.SaveListeningResult(ctx, u1, "kfp-shifu-1", sc, []int{100, sc, 0}); err != nil {
			t.Fatal(err)
		}
	}
	if err := st.SaveListeningResult(ctx, u1, "kfp-shifu-2", 55, nil); err != nil {
		t.Fatal(err)
	}
	if err := st.SaveListeningResult(ctx, u2, "kfp-shifu-1", 100, []int{100}); err != nil {
		t.Fatal(err)
	}

	p, err := st.ListeningProgress(ctx, u1)
	if err != nil {
		t.Fatal(err)
	}
	if got := p["kfp-shifu-1"]; got != (ListeningClip{Best: 90, Last: 70, Tries: 3}) {
		t.Errorf("kfp-shifu-1: %+v", got)
	}
	if got := p["kfp-shifu-2"]; got != (ListeningClip{Best: 55, Last: 55, Tries: 1}) {
		t.Errorf("kfp-shifu-2: %+v", got)
	}
	// чужие результаты не видны
	p2, _ := st.ListeningProgress(ctx, u2)
	if len(p2) != 1 || p2["kfp-shifu-1"].Best != 100 {
		t.Errorf("прогресс второго пользователя: %+v", p2)
	}

	// история: новые сверху, с результатами по фразам
	h, err := st.ListeningHistory(ctx, u1, 10)
	if err != nil || len(h) != 4 {
		t.Fatalf("история: %d %v", len(h), err)
	}
	if h[0].Clip != "kfp-shifu-2" || h[1].Score != 70 || len(h[1].Phrases) != 3 || h[1].Phrases[1] != 70 {
		t.Errorf("порядок/содержимое истории: %+v", h)
	}
	if h2, _ := st.ListeningHistory(ctx, u1, 2); len(h2) != 2 {
		t.Errorf("limit: %d", len(h2))
	}

	// удаление пользователя чистит его результаты (ON DELETE CASCADE)
	if _, err := st.db.ExecContext(ctx, `DELETE FROM users WHERE id = $1`, u2); err != nil {
		t.Fatal(err)
	}
	if p, _ := st.ListeningProgress(ctx, u2); len(p) != 0 {
		t.Errorf("результаты удалённого пользователя остались: %+v", p)
	}
}
