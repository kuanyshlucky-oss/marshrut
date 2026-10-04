//go:build integration

package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"marshrut-api/internal/testdb"
)

var pg *testdb.Server

func TestMain(m *testing.M) {
	var err error
	pg, err = testdb.Start()
	if err != nil {
		fmt.Fprintln(os.Stderr, "не удалось запустить Postgres:", err)
		os.Exit(1)
	}
	code := m.Run()
	pg.Stop()
	os.Exit(code)
}

// newStore — чистая БД с применёнными миграциями и справочниками.
func newStore(t *testing.T) *Store {
	t.Helper()
	dsn, err := pg.NewDB()
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	st, err := Open(ctx, dsn, 5)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	if err := st.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err := st.SeedReference(ctx); err != nil {
		t.Fatal(err)
	}
	return st
}

func mustUser(t *testing.T, st *Store, email string) int64 {
	t.Helper()
	id, err := st.CreateUser(context.Background(), "Name", email, "hash")
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func TestMigrateAndSeedAreIdempotent(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	for i := 0; i < 3; i++ { // повторный старт (рестарт/деплой) ничего не ломает
		if err := st.Migrate(ctx); err != nil {
			t.Fatalf("Migrate #%d: %v", i, err)
		}
		if err := st.SeedReference(ctx); err != nil {
			t.Fatalf("SeedReference #%d: %v", i, err)
		}
	}
	var n int
	st.db.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&n)
	if migs, _ := loadMigrations(migrationsFS); n != len(migs) {
		t.Errorf("записей в schema_migrations = %d, want %d", n, len(migs))
	}
	specs, err := st.Specialities(ctx)
	if err != nil || len(specs) < 100 {
		t.Errorf("специальностей: %d, err=%v", len(specs), err)
	}
}

// Одновременный старт двух инстансов (при деплое старый и новый живут вместе)
// не должен ни падать, ни применять миграции дважды.
func TestConcurrentMigrate(t *testing.T) {
	dsn, _ := pg.NewDB()
	ctx := context.Background()
	var wg sync.WaitGroup
	errs := make(chan error, 6)
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			st, err := Open(ctx, dsn, 2)
			if err != nil {
				errs <- err
				return
			}
			defer st.Close()
			errs <- st.Migrate(ctx)
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Errorf("параллельная миграция: %v", err)
		}
	}
}

func TestUserLifecycle(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	id := mustUser(t, st, "a@x.kz")

	if _, err := st.CreateUser(ctx, "Dup", "a@x.kz", "h"); !errors.Is(err, ErrEmailTaken) {
		t.Errorf("повторный логин: %v, want ErrEmailTaken", err)
	}
	if _, _, err := st.UserAuth(ctx, "nobody@x.kz"); !errors.Is(err, ErrNotFound) {
		t.Errorf("UserAuth несуществующего: %v", err)
	}
	if _, err := st.LoadUser(ctx, 999999); !errors.Is(err, ErrNotFound) {
		t.Errorf("LoadUser несуществующего: %v", err)
	}

	u, err := st.LoadUser(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	// пустые коллекции должны быть [] (а не null) — фронт делает .map/.length
	if u.Favorites == nil || u.Results == nil || u.Access == nil || u.TopicStats == nil {
		t.Errorf("nil-коллекции в пустом пользователе: %+v", u)
	}

	p := Profile{FullName: "Иван Иванов", Phone: "+7", City: "Алматы", SpecialityID: 5, ForeignScore: 30}
	if err := st.UpdateProfile(ctx, id, p); err != nil {
		t.Fatal(err)
	}
	u, _ = st.LoadUser(ctx, id)
	if u.Name != "Иван Иванов" || u.Profile.City != "Алматы" || u.Profile.ForeignScore != 30 {
		t.Errorf("профиль не сохранился: %+v", u)
	}
	// пустое ФИО не затирает name
	st.UpdateProfile(ctx, id, Profile{})
	if u, _ = st.LoadUser(ctx, id); u.Name != "Иван Иванов" {
		t.Errorf("name затёрт пустым ФИО: %q", u.Name)
	}
}

func TestFavoritesToggleAndLimit(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	id := mustUser(t, st, "f@x.kz")

	if err := st.ToggleFavorite(ctx, id, "7M01"); err != nil {
		t.Fatal(err)
	}
	if u, _ := st.LoadUser(ctx, id); len(u.Favorites) != 1 {
		t.Fatalf("после включения: %v", u.Favorites)
	}
	st.ToggleFavorite(ctx, id, "7M01")
	if u, _ := st.LoadUser(ctx, id); len(u.Favorites) != 0 {
		t.Fatalf("после выключения: %v", u.Favorites)
	}

	for i := 0; i < MaxFavorites; i++ {
		if err := st.ToggleFavorite(ctx, id, fmt.Sprintf("C%d", i)); err != nil {
			t.Fatalf("избранное #%d: %v", i, err)
		}
	}
	if err := st.ToggleFavorite(ctx, id, "OVER"); !errors.Is(err, ErrTooManyFavorites) {
		t.Errorf("сверх лимита: %v, want ErrTooManyFavorites", err)
	}
	// снять существующее по-прежнему можно при полном лимите
	if err := st.ToggleFavorite(ctx, id, "C0"); err != nil {
		t.Errorf("снятие при полном лимите: %v", err)
	}
}

func TestResultsAndTopicStats(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	id := mustUser(t, st, "r@x.kz")

	hits := []TopicHit{
		{"Тема 1", true, "subj1"}, {"Тема 1", false, "subj1"}, {"Тема 1", true, "subj1"},
		{"Тема 2", true, "subj2"}, {"", true, "subj1"}, {"Без раздела", true, ""},
	}
	if err := addResult(t, st, id, "7M01", 12, 20, "subject", true, "subj1", hits); err != nil {
		t.Fatal(err)
	}
	if err := addResult(t, st, id, "7M01", 5, 10, "subject", false, "subj1", hits[:1]); err != nil {
		t.Fatal(err)
	}
	u, _ := st.LoadUser(ctx, id)
	if len(u.Results) != 2 || u.Results[0].Score != 12 || !u.Results[0].Passed || u.Results[1].Passed {
		t.Errorf("результаты: %+v", u.Results)
	}
	got := map[string]TopicStat{}
	for _, ts := range u.TopicStats {
		got[ts.Section+"/"+ts.Topic] = ts
	}
	if len(got) != 2 {
		t.Errorf("статистика по темам (пустые тема/раздел отбрасываются): %+v", got)
	}
	if s := got["subj1/Тема 1"]; s.Correct != 3 || s.Wrong != 1 { // 2+1 верных, 1 неверный — накопительно
		t.Errorf("subj1/Тема 1 = %+v, want correct=3 wrong=1", s)
	}
}

func TestResultsLimit(t *testing.T) {
	st := newStore(t)
	id := mustUser(t, st, "lim@x.kz")
	if _, err := st.db.Exec(`INSERT INTO results(user_id, code, score, total, date)
		SELECT $1, 'X', 1, 1, '2026-01-01' FROM generate_series(1, $2)`, id, MaxResultsPerUser); err != nil {
		t.Fatal(err)
	}
	if err := addResult(t, st, id, "7M01", 1, 1, "", false, "", nil); !errors.Is(err, ErrTooManyResults) {
		t.Errorf("сверх лимита: %v, want ErrTooManyResults", err)
	}
}

// Результат и статистика по темам пишутся атомарно: сбой второго шага не оставляет
// «полупопытки» в первом.
func TestAddResultIsAtomic(t *testing.T) {
	st := newStore(t)
	id := mustUser(t, st, "atom@x.kz")
	if _, err := st.db.Exec(`ALTER TABLE topic_stats RENAME TO topic_stats_broken`); err != nil {
		t.Fatal(err)
	}
	err := addResult(t, st, id, "7M01", 1, 1, "subject", true, "subj1", []TopicHit{{"T", true, "subj1"}})
	if err == nil {
		t.Fatal("ожидалась ошибка из-за отсутствующей таблицы")
	}
	var n int
	st.db.QueryRow(`SELECT COUNT(*) FROM results WHERE user_id = $1`, id).Scan(&n)
	if n != 0 {
		t.Errorf("результат остался в БД после сбоя статистики: %d", n)
	}
}

func TestDeleteUserRemovesEverything(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	id := mustUser(t, st, "del@x.kz")
	other := mustUser(t, st, "keep@x.kz")
	for _, uid := range []int64{id, other} {
		st.ToggleFavorite(ctx, uid, "7M01")
		addResult(t, st, uid, "7M01", 1, 2, "subject", false, "subj1", []TopicHit{{"T", true, "subj1"}})
		st.GrantAccess(ctx, uid, "7M01", "ru")
		st.Roadmap(ctx, uid, time.Now().Year(), false)
	}
	if err := st.DeleteUser(ctx, id); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"favorites", "results", "topic_stats", "test_access", "user_checklist"} {
		var mine, others int
		st.db.QueryRow(`SELECT COUNT(*) FROM `+table+` WHERE user_id = $1`, id).Scan(&mine)
		st.db.QueryRow(`SELECT COUNT(*) FROM `+table+` WHERE user_id = $1`, other).Scan(&others)
		if mine != 0 {
			t.Errorf("%s: у удалённого пользователя осталось %d строк", table, mine)
		}
		if table != "user_checklist" && others == 0 {
			t.Errorf("%s: удалены данные чужого пользователя", table)
		}
	}
	if _, err := st.LoadUser(ctx, id); !errors.Is(err, ErrNotFound) {
		t.Error("пользователь не удалён")
	}
}

func TestResetProgressKeepsAccount(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	id := mustUser(t, st, "rp@x.kz")
	st.ToggleFavorite(ctx, id, "7M01")
	addResult(t, st, id, "7M01", 1, 2, "subject", false, "subj1", []TopicHit{{"T", true, "subj1"}})
	if err := st.ResetProgress(ctx, id); err != nil {
		t.Fatal(err)
	}
	u, _ := st.LoadUser(ctx, id)
	if len(u.Results) != 0 || len(u.TopicStats) != 0 {
		t.Errorf("прогресс не сброшен: %+v", u)
	}
	if len(u.Favorites) != 1 {
		t.Error("сброс прогресса не должен трогать избранное")
	}
}

func TestAccessGrantRevoke(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	id := mustUser(t, st, "acc@x.kz")
	if ok, _ := st.HasAccess(ctx, id, "7M01", "ru"); ok {
		t.Fatal("доступ есть без выдачи")
	}
	st.GrantAccess(ctx, id, "7M01", "ru")
	st.GrantAccess(ctx, id, "7M01", "ru") // повторная выдача идемпотентна
	if ok, _ := st.HasAccess(ctx, id, "7M01", "ru"); !ok {
		t.Error("доступ не выдан")
	}
	if ok, _ := st.HasAccess(ctx, id, "7M01", "kk"); ok {
		t.Error("доступ на ru не должен давать доступ на kk")
	}
	st.GrantAccess(ctx, id, "7M01", "kk")
	if u, _ := st.LoadUser(ctx, id); len(u.Access) != 1 { // DISTINCT по коду
		t.Errorf("access = %v, want один код при двух языках", u.Access)
	}
	st.RevokeAccess(ctx, id, "7M01", "ru")
	if ok, _ := st.HasAccess(ctx, id, "7M01", "ru"); ok {
		t.Error("доступ не отозван")
	}
}

func TestSessionAndPassword(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	id := mustUser(t, st, "s@x.kz")
	if err := st.SetSessionID(ctx, id, "sid-1"); err != nil {
		t.Fatal(err)
	}
	if sid, err := st.SessionID(ctx, id); err != nil || sid != "sid-1" {
		t.Errorf("SessionID = %q, %v", sid, err)
	}
	if _, err := st.SessionID(ctx, 999999); !errors.Is(err, ErrNotFound) {
		t.Errorf("SessionID несуществующего: %v", err)
	}
	if err := st.SetPasswordHash(ctx, 999999, "x"); !errors.Is(err, ErrNotFound) {
		t.Errorf("SetPasswordHash несуществующего: %v", err)
	}
}

func TestAuditLog(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	for i := 0; i < 5; i++ {
		if err := st.LogAdmin(ctx, "act", fmt.Sprint(i), "d", "1.1.1.1"); err != nil {
			t.Fatal(err)
		}
	}
	got, err := st.ListAudit(ctx, 3)
	if err != nil || len(got) != 3 || got[0].Target != "4" {
		t.Errorf("ListAudit = %+v, %v (новые записи первыми, limit=3)", got, err)
	}
}

// Защита входа: пороги, окно, блокировка и её истечение.
func TestLoginGuard(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	const key = "p|a@x.kz|1.1.1.1"
	locked := func() bool {
		l, err := st.IsLocked(ctx, key, "other-key")
		if err != nil {
			t.Fatal(err)
		}
		return l
	}
	for i := 1; i <= 4; i++ {
		st.RecordFailure(ctx, key, 5, time.Minute, time.Minute)
		if locked() {
			t.Fatalf("заблокирован раньше порога на попытке %d", i)
		}
	}
	st.RecordFailure(ctx, key, 5, time.Minute, time.Minute)
	if !locked() {
		t.Fatal("на пятой неудаче должна быть блокировка")
	}
	if l, _ := st.IsLocked(ctx, "p|a@x.kz|2.2.2.2"); l {
		t.Error("другой ключ заблокирован")
	}
	st.ResetFailures(ctx, key)
	if locked() {
		t.Error("ResetFailures не снял блокировку")
	}
}

func TestLoginGuardLockExpiresAndWindowResets(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	const key = "k"
	for i := 0; i < 3; i++ {
		st.RecordFailure(ctx, key, 3, time.Minute, 300*time.Millisecond)
	}
	if l, _ := st.IsLocked(ctx, key); !l {
		t.Fatal("нет блокировки")
	}
	time.Sleep(450 * time.Millisecond)
	if l, _ := st.IsLocked(ctx, key); l {
		t.Error("блокировка не истекла")
	}
	// окно: неудачи, вышедшие за окно, не копятся
	const key2 = "k2"
	st.RecordFailure(ctx, key2, 2, 200*time.Millisecond, time.Minute)
	time.Sleep(350 * time.Millisecond)
	st.RecordFailure(ctx, key2, 2, 200*time.Millisecond, time.Minute)
	if l, _ := st.IsLocked(ctx, key2); l {
		t.Error("неудачи из разных окон не должны суммироваться")
	}
}

// Параллельные неудачи не теряются: гонки на счётчике нет.
func TestLoginGuardConcurrentFailures(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	var wg sync.WaitGroup
	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			st.RecordFailure(ctx, "race", 1000, time.Minute, time.Minute)
		}()
	}
	wg.Wait()
	var fails int
	st.db.QueryRow(`SELECT fails FROM login_attempts WHERE key = 'race'`).Scan(&fails)
	if fails != 40 {
		t.Errorf("fails = %d, want 40 (потеряны параллельные обновления)", fails)
	}
}

func TestPurgeAttempts(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	st.db.Exec(`INSERT INTO login_attempts(key, fails, window_start) VALUES('old', 1, now() - interval '2 days')`)
	st.db.Exec(`INSERT INTO login_attempts(key, fails, window_start, locked_until) VALUES('oldlocked', 5, now() - interval '2 days', now() + interval '1 hour')`)
	st.db.Exec(`INSERT INTO login_attempts(key, fails, window_start) VALUES('fresh', 1, now())`)
	n, err := st.PurgeAttempts(ctx, 24*time.Hour)
	if err != nil || n != 1 {
		t.Errorf("удалено %d (err=%v), want 1: только старая незаблокированная запись", n, err)
	}
}

func TestRoadmap(t *testing.T) {
	st := newStore(t)
	ctx := context.Background()
	id := mustUser(t, st, "rm@x.kz")
	year := time.Now().Year()
	steps, err := st.Roadmap(ctx, id, year, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(steps) == 0 {
		t.Skipf("шаблон дорожной карты на %d год пуст (сид содержит только 2026)", year)
	}
	if err := st.ToggleRoadmapStep(ctx, id, steps[0].TemplateID); err != nil {
		t.Fatal(err)
	}
	steps, _ = st.Roadmap(ctx, id, year, true)
	if !steps[0].Completed || steps[0].CompletedAt == "" {
		t.Errorf("шаг не отмечен: %+v", steps[0])
	}
}

func TestContextCancellationAbortsQuery(t *testing.T) {
	st := newStore(t)
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err := st.db.ExecContext(ctx, `SELECT pg_sleep(5)`)
	if err == nil || time.Since(start) > 2*time.Second {
		t.Errorf("запрос не прерван по контексту: err=%v, %v", err, time.Since(start))
	}
}

// addResult — тестовый помощник: результат без попытки (в проде результат
// создаётся только при сдаче попытки).
func addResult(t *testing.T, st *Store, uid int64, code string, score, total int, kind string, passed bool, section string, hits []TopicHit) error {
	t.Helper()
	return st.inTx(context.Background(), func(tx *sql.Tx) error {
		return addResultTx(context.Background(), tx, uid, code, score, total, kind, passed, section, "", hits)
	})
}
