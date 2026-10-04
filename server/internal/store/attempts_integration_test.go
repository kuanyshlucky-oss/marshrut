//go:build integration

package store

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func mkAttempt(uid int64, id string) *Attempt {
	return &Attempt{
		ID: id, UserID: uid, Kind: "subject", Code: "7M01", Section: "subj1", ContentLang: "ru", Title: "T",
		Items: []byte(`[{"b":"x","i":0,"k":"subj1","f":"ab"}]`), ExpiresAt: time.Now().Add(time.Hour),
	}
}

// okGrade — проверка «всё верно»: 1 из 1, с одной темой.
func okGrade(a *Attempt) (*Submission, error) {
	return &Submission{Code: a.Code, Kind: "subject", Score: 1, Total: 1, Passed: true, Section: a.Section,
		Hits: []TopicHit{{"Тема", true, "subj1"}}}, nil
}

func TestAttemptLifecycle(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	uid := mustUser(t, st, "att@x.kz")
	a := mkAttempt(uid, "attempt-one")
	if err := st.CreateAttempt(ctx, a); err != nil {
		t.Fatal(err)
	}
	if a.CreatedAt.IsZero() {
		t.Error("CreatedAt не заполнен")
	}

	got, err := st.GetAttempt(ctx, "attempt-one", uid)
	if err != nil || got.SubmittedAt != nil || got.Answers != nil {
		t.Fatalf("GetAttempt: %+v %v", got, err)
	}
	if _, err := st.GetAttempt(ctx, "attempt-one", uid+999); !errors.Is(err, ErrNotFound) {
		t.Errorf("чужая попытка: %v, want ErrNotFound", err)
	}
	if _, err := st.GetAttempt(ctx, "nope", uid); !errors.Is(err, ErrNotFound) {
		t.Errorf("несуществующая: %v", err)
	}

	sub, done, err := st.SubmitAttempt(ctx, "attempt-one", uid, []byte(`[0]`), time.Now(), okGrade)
	if err != nil || done || sub.SubmittedAt == nil {
		t.Fatalf("сдача: %+v done=%v err=%v", sub, done, err)
	}
	u, _ := st.LoadUser(ctx, uid)
	if len(u.Results) != 1 || u.Results[0].AttemptID != "attempt-one" || !u.Results[0].Passed || u.Results[0].Score != 1 {
		t.Errorf("результат: %+v", u.Results)
	}
	if len(u.TopicStats) != 1 || u.TopicStats[0].Correct != 1 {
		t.Errorf("статистика по темам: %+v", u.TopicStats)
	}
	saved, _ := st.GetAttempt(ctx, "attempt-one", uid)
	if saved.SubmittedAt == nil || string(saved.Answers) == "" {
		t.Errorf("ответы не сохранены: %+v", saved)
	}
}

// Повторная сдача не создаёт второй результат и не перезаписывает ответы.
func TestSubmitIsIdempotent(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	uid := mustUser(t, st, "idem@x.kz")
	st.CreateAttempt(ctx, mkAttempt(uid, "a1"))
	if _, _, err := st.SubmitAttempt(ctx, "a1", uid, []byte(`[0]`), time.Now(), okGrade); err != nil {
		t.Fatal(err)
	}
	calls := 0
	a, done, err := st.SubmitAttempt(ctx, "a1", uid, []byte(`[9]`), time.Now(), func(*Attempt) (*Submission, error) {
		calls++
		return okGrade(nil)
	})
	if err != nil || !done || calls != 0 {
		t.Fatalf("повторная сдача: done=%v err=%v grade вызван %d раз", done, err, calls)
	}
	if string(a.Answers) != "[0]" {
		t.Errorf("ответы перезаписаны: %s", a.Answers)
	}
	var n int
	st.db.QueryRow(`SELECT COUNT(*) FROM results WHERE user_id = $1`, uid).Scan(&n)
	if n != 1 {
		t.Errorf("результатов %d, want 1", n)
	}
}

// Параллельная сдача одной попытки (двойной клик, ретрай): ровно один результат.
func TestConcurrentSubmitWritesOneResult(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	uid := mustUser(t, st, "conc@x.kz")
	st.CreateAttempt(ctx, mkAttempt(uid, "race"))
	var fresh atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, done, err := st.SubmitAttempt(ctx, "race", uid, []byte(`[0]`), time.Now(), okGrade)
			if err != nil {
				t.Errorf("SubmitAttempt: %v", err)
			}
			if !done {
				fresh.Add(1)
			}
		}()
	}
	wg.Wait()
	if fresh.Load() != 1 {
		t.Errorf("«первой» сдачей признано %d вызовов, want 1", fresh.Load())
	}
	var n int
	st.db.QueryRow(`SELECT COUNT(*) FROM results WHERE user_id = $1`, uid).Scan(&n)
	if n != 1 {
		t.Errorf("результатов %d, want 1", n)
	}
	var correct int
	st.db.QueryRow(`SELECT correct FROM topic_stats WHERE user_id = $1`, uid).Scan(&correct)
	if correct != 1 {
		t.Errorf("статистика по теме удвоена: %d", correct)
	}
}

func TestSubmitExpiredAndForeign(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	uid := mustUser(t, st, "exp@x.kz")
	other := mustUser(t, st, "oth@x.kz")
	a := mkAttempt(uid, "old")
	a.ExpiresAt = time.Now().Add(-time.Minute)
	st.CreateAttempt(ctx, a)

	if _, _, err := st.SubmitAttempt(ctx, "old", uid, []byte(`[0]`), time.Now(), okGrade); !errors.Is(err, ErrAttemptExpired) {
		t.Errorf("просроченная: %v, want ErrAttemptExpired", err)
	}
	st.CreateAttempt(ctx, mkAttempt(uid, "mine"))
	if _, _, err := st.SubmitAttempt(ctx, "mine", other, []byte(`[0]`), time.Now(), okGrade); !errors.Is(err, ErrNotFound) {
		t.Errorf("чужая попытка: %v, want ErrNotFound", err)
	}
	u, _ := st.LoadUser(ctx, uid)
	if len(u.Results) != 0 {
		t.Errorf("результат записан несмотря на отказ: %+v", u.Results)
	}
}

// Ошибка проверки (например, кривые ответы) откатывает всё: результат не пишется,
// попытка остаётся несданной и её можно сдать корректно.
func TestSubmitGradeFailureRollsBack(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	uid := mustUser(t, st, "rb@x.kz")
	st.CreateAttempt(ctx, mkAttempt(uid, "rb"))
	boom := errors.New("boom")
	if _, _, err := st.SubmitAttempt(ctx, "rb", uid, []byte(`[7]`), time.Now(), func(*Attempt) (*Submission, error) { return nil, boom }); !errors.Is(err, boom) {
		t.Fatalf("ошибка grade должна вернуться как есть: %v", err)
	}
	a, _ := st.GetAttempt(ctx, "rb", uid)
	if a.SubmittedAt != nil || a.Answers != nil {
		t.Errorf("попытка изменилась после сбоя: %+v", a)
	}
	if _, done, err := st.SubmitAttempt(ctx, "rb", uid, []byte(`[0]`), time.Now(), okGrade); err != nil || done {
		t.Errorf("повторная корректная сдача: done=%v err=%v", done, err)
	}
}

func TestAttemptHourlyLimit(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	uid := mustUser(t, st, "lim@x.kz")
	other := mustUser(t, st, "lim2@x.kz")
	for i := 0; i < MaxAttemptsPerHour; i++ {
		if err := st.CreateAttempt(ctx, mkAttempt(uid, fmt.Sprint("a", i))); err != nil {
			t.Fatalf("попытка %d: %v", i, err)
		}
	}
	if err := st.CreateAttempt(ctx, mkAttempt(uid, "over")); !errors.Is(err, ErrTooManyAttempts) {
		t.Errorf("сверх лимита: %v", err)
	}
	if err := st.CreateAttempt(ctx, mkAttempt(other, "free")); err != nil {
		t.Errorf("лимит одного пользователя задел другого: %v", err)
	}
	// старые попытки не считаются
	st.db.Exec(`UPDATE attempts SET created_at = now() - interval '2 hours' WHERE user_id = $1`, uid)
	if err := st.CreateAttempt(ctx, mkAttempt(uid, "again")); err != nil {
		t.Errorf("после окна: %v", err)
	}
}

func TestPurgeAttemptsData(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	uid := mustUser(t, st, "pg@x.kz")
	for _, id := range []string{"abandoned", "recent-open", "old-done", "recent-done"} {
		st.CreateAttempt(ctx, mkAttempt(uid, id))
	}
	st.SubmitAttempt(ctx, "old-done", uid, []byte(`[0]`), time.Now(), okGrade)
	st.SubmitAttempt(ctx, "recent-done", uid, []byte(`[0]`), time.Now(), okGrade)
	st.db.Exec(`UPDATE attempts SET expires_at = now() - interval '2 days' WHERE id = 'abandoned'`)
	st.db.Exec(`UPDATE attempts SET created_at = now() - interval '100 days' WHERE id = 'old-done'`)
	n, err := st.PurgeAttemptsData(ctx)
	if err != nil || n != 2 {
		t.Fatalf("удалено %d (err=%v), want 2: брошенная и старая сданная", n, err)
	}
	for id, want := range map[string]bool{"abandoned": false, "old-done": false, "recent-open": true, "recent-done": true} {
		_, err := st.GetAttempt(ctx, id, uid)
		if (err == nil) != want {
			t.Errorf("%s: существует=%v, want %v", id, err == nil, want)
		}
	}
	// результат старой попытки остаётся в кабинете, пропадает только разбор
	u, _ := st.LoadUser(ctx, uid)
	if len(u.Results) != 2 {
		t.Errorf("результаты: %d, want 2", len(u.Results))
	}
}

func TestDeleteAndResetRemoveAttempts(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	uid := mustUser(t, st, "dr@x.kz")
	keep := mustUser(t, st, "keep2@x.kz")
	st.CreateAttempt(ctx, mkAttempt(uid, "u1"))
	st.CreateAttempt(ctx, mkAttempt(keep, "k1"))
	st.ResetProgress(ctx, uid)
	if _, err := st.GetAttempt(ctx, "u1", uid); !errors.Is(err, ErrNotFound) {
		t.Error("ResetProgress не удалил попытки")
	}
	st.CreateAttempt(ctx, mkAttempt(uid, "u2"))
	st.DeleteUser(ctx, uid)
	var n int
	st.db.QueryRow(`SELECT COUNT(*) FROM attempts WHERE user_id = $1`, uid).Scan(&n)
	if n != 0 {
		t.Errorf("DeleteUser оставил %d попыток", n)
	}
	if _, err := st.GetAttempt(ctx, "k1", keep); err != nil {
		t.Errorf("чужая попытка удалена: %v", err)
	}
}
