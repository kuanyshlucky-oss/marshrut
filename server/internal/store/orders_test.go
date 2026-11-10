package store

import (
	"testing"
	"time"
)

func TestExtendExpiry(t *testing.T) {
	now := time.Date(2026, 11, 10, 15, 0, 0, 0, time.UTC)
	cases := []struct {
		name    string
		exists  bool
		current string
		days    int
		want    string
	}{
		{"доступа не было: от сегодня", false, "", 90, "2027-02-08"},
		{"доступ действует: продлеваем от его конца", true, "2026-12-01", 90, "2027-03-01"},
		{"доступ истёк вчера: считаем от сегодня", true, "2026-11-09", 90, "2027-02-08"},
		{"заканчивается сегодня: продлеваем от сегодня", true, "2026-11-10", 30, "2026-12-10"},
		{"бессрочный остаётся бессрочным", true, "", 90, ""},
		{"битая дата в БД: от сегодня", true, "garbage", 10, "2026-11-20"},
	}
	for _, c := range cases {
		if got := extendExpiry(c.exists, c.current, c.days, now); got != c.want {
			t.Errorf("%s: %q, ждали %q", c.name, got, c.want)
		}
	}
}

func TestTokenHashing(t *testing.T) {
	a, err := newToken()
	if err != nil || len(a) < 40 {
		t.Fatalf("токен: %q %v", a, err)
	}
	b, _ := newToken()
	if a == b {
		t.Error("два токена совпали")
	}
	if hashToken(a) == a || hashToken(a) != hashToken(a) || len(hashToken(a)) != 64 {
		t.Error("хеш токена некорректен")
	}
}
