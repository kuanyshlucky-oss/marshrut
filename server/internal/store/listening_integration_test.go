//go:build integration

package store

import (
	"context"
	"errors"
	"fmt"
	"testing"
)

func save(t *testing.T, st *Store, uid int64, clip, id string, score int, phrases []int) bool {
	t.Helper()
	dup, err := st.SaveListeningResult(context.Background(), uid, clip, id, score, phrases)
	if err != nil {
		t.Fatalf("SaveListeningResult(%s): %v", clip, err)
	}
	return dup
}

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
		save(t, st, u1, "kfp-shifu-1", "", sc, []int{100, sc, 0})
	}
	save(t, st, u1, "kfp-shifu-2", "", 55, nil)
	save(t, st, u2, "kfp-shifu-1", "", 100, []int{100})

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
	var left int
	st.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM listening_attempts WHERE user_id = $1`, u2).Scan(&left)
	if left != 0 {
		t.Errorf("попытки удалённого пользователя остались: %d", left)
	}
}

// Повторная отправка того же прохождения (тот же attempt id) не создаёт дубль и не меняет сводку.
func TestListeningIdempotent(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	u := mustUser(t, st, "idem@x.kz")
	other := mustUser(t, st, "idem2@x.kz")

	if dup := save(t, st, u, "nemo", "attempt-0001", 80, []int{100, 60}); dup {
		t.Fatal("первая запись помечена как дубль")
	}
	for i := 0; i < 3; i++ {
		if dup := save(t, st, u, "nemo", "attempt-0001", 80, []int{100, 60}); !dup {
			t.Errorf("повтор #%d не распознан как дубль", i+1)
		}
	}
	if p, _ := st.ListeningProgress(ctx, u); p["nemo"] != (ListeningClip{Best: 80, Last: 80, Tries: 1}) {
		t.Errorf("повторы изменили сводку: %+v", p["nemo"])
	}
	if h, _ := st.ListeningHistory(ctx, u, 10); len(h) != 1 {
		t.Errorf("в истории %d записей, want 1", len(h))
	}
	// тот же id у другого пользователя — отдельная запись
	if dup := save(t, st, other, "nemo", "attempt-0001", 50, nil); dup {
		t.Error("id чужого пользователя принят за дубль")
	}
	// новый id — новая попытка
	save(t, st, u, "nemo", "attempt-0002", 90, nil)
	if p, _ := st.ListeningProgress(ctx, u); p["nemo"] != (ListeningClip{Best: 90, Last: 90, Tries: 2}) {
		t.Errorf("после второго прохождения: %+v", p["nemo"])
	}
	// без id (старый клиент) каждая отправка — новая попытка
	save(t, st, u, "nemo", "", 10, nil)
	save(t, st, u, "nemo", "", 10, nil)
	if p, _ := st.ListeningProgress(ctx, u); p["nemo"].Tries != 4 {
		t.Errorf("попыток без id: %+v", p["nemo"])
	}
}

// История клипа не растёт бесконечно, а сводка (лучший/попытки) от обрезки не страдает.
func TestListeningHistoryTrimmed(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	u := mustUser(t, st, "trim@x.kz")

	total := ListeningKeepAttempts + 10
	for i := 0; i < total; i++ {
		sc := 50
		if i == 0 {
			sc = 99 // лучший результат — в самой первой попытке, которая из истории уйдёт
		}
		save(t, st, u, "shrek", fmt.Sprintf("trim-attempt-%03d", i), sc, nil)
	}
	h, _ := st.ListeningHistory(ctx, u, 1000)
	if len(h) != ListeningKeepAttempts {
		t.Errorf("в истории %d записей, want %d", len(h), ListeningKeepAttempts)
	}
	p, _ := st.ListeningProgress(ctx, u)
	if got := p["shrek"]; got != (ListeningClip{Best: 99, Last: 50, Tries: total}) {
		t.Errorf("сводка после обрезки истории: %+v", got)
	}
	// обрезка идёт по клипам отдельно: другой клип не затронут
	save(t, st, u, "matrix", "trim-other-001", 70, nil)
	if h, _ := st.ListeningHistory(ctx, u, 1000); len(h) != ListeningKeepAttempts+1 {
		t.Errorf("история с двумя клипами: %d", len(h))
	}
}

// Один аккаунт не может завести бесконечно много «клипов»; уже существующие клипы это не блокирует.
func TestListeningClipCap(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	u := mustUser(t, st, "cap@x.kz")

	for i := 0; i < ListeningMaxClips; i++ {
		save(t, st, u, fmt.Sprintf("clip-%03d", i), "", 50, nil)
	}
	_, err := st.SaveListeningResult(ctx, u, "one-more-clip", "", 50, nil)
	if !errors.Is(err, ErrTooManyClips) {
		t.Fatalf("клип сверх лимита: err = %v, want ErrTooManyClips", err)
	}
	// отклонённая запись не оставила следа ни в сводке, ни в истории
	p, _ := st.ListeningProgress(ctx, u)
	if _, ok := p["one-more-clip"]; ok || len(p) != ListeningMaxClips {
		t.Errorf("сводка после отказа: %d клипов", len(p))
	}
	var n int
	st.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM listening_attempts WHERE user_id = $1 AND clip_id = 'one-more-clip'`, u).Scan(&n)
	if n != 0 {
		t.Errorf("отклонённая попытка попала в историю: %d", n)
	}
	// уже известный клип по-прежнему принимается
	save(t, st, u, "clip-000", "", 80, nil)
	if p, _ := st.ListeningProgress(ctx, u); p["clip-000"].Tries != 2 {
		t.Errorf("повторное прохождение известного клипа: %+v", p["clip-000"])
	}
}
