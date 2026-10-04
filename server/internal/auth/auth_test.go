package auth

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func newSigner() *Signer { return NewSigner([]byte("unit-test-secret-unit-test-secret")) }

func TestTokenRoundTrip(t *testing.T) {
	s := newSigner()
	c, err := s.Parse(s.Make(42, "sess-abc"))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if c.UID != 42 || c.SID != "sess-abc" {
		t.Errorf("claims = %+v", c)
	}
}

func TestTokenTamperedPayload(t *testing.T) {
	s := newSigner()
	sig := strings.SplitN(s.Make(1, "s"), ".", 2)[1]
	raw, _ := json.Marshal(Claims{UID: 999, SID: "s", Exp: time.Now().Add(time.Hour).Unix()})
	forged := base64.RawURLEncoding.EncodeToString(raw) + "." + sig
	if _, err := s.Parse(forged); err == nil {
		t.Error("подделанный payload принят")
	}
}

func TestTokenWrongSecret(t *testing.T) {
	tok := newSigner().Make(1, "s")
	if _, err := NewSigner([]byte("another-secret-another-secret-00")).Parse(tok); err == nil {
		t.Error("токен, подписанный другим секретом, принят")
	}
}

func TestTokenExpired(t *testing.T) {
	s := newSigner()
	s.now = func() time.Time { return time.Now().Add(-2 * TokenTTL) }
	tok := s.Make(1, "s")
	if _, err := newSigner().Parse(tok); err == nil {
		t.Error("просроченный токен принят")
	}
}

func TestTokenMalformed(t *testing.T) {
	s := newSigner()
	for _, c := range []string{"", "no-dot-here", "a.b.c", "not-base64!!.sig", ".", "a."} {
		if _, err := s.Parse(c); err == nil {
			t.Errorf("некорректный токен %q принят", c)
		}
	}
}

func TestRandString(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		s := RandString(20)
		if len(s) != 20 {
			t.Fatalf("len = %d", len(s))
		}
		if strings.ContainsAny(s, "0O1lI") {
			t.Errorf("неоднозначный символ в %q", s)
		}
		seen[s] = true
	}
	if len(seen) < 200 {
		t.Error("RandString повторяется")
	}
}

func TestPasswordHashing(t *testing.T) {
	h, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	if !CheckPassword(h, "correct horse battery staple") {
		t.Error("верный пароль не принят")
	}
	if CheckPassword(h, "wrong") {
		t.Error("неверный пароль принят")
	}
}

func TestPasswordMaxLen(t *testing.T) {
	long := strings.Repeat("a", MaxPasswordLen+1)
	if _, err := HashPassword(long); err == nil {
		t.Error("пароль длиннее 72 байт должен отклоняться при хешировании")
	}
	h, _ := HashPassword(strings.Repeat("a", MaxPasswordLen))
	// bcrypt молча обрезает по 72 байтам — без проверки «aaaa…a»+«b» совпало бы с «aaaa…a»
	if CheckPassword(h, strings.Repeat("a", MaxPasswordLen)+"b") {
		t.Error("длинный пароль не должен совпадать по обрезанному префиксу")
	}
}

func TestSessionCache(t *testing.T) {
	c := NewSessionCache(30*time.Millisecond, 2)
	c.Put(1, "s1")
	if sid, ok := c.Get(1); !ok || sid != "s1" {
		t.Errorf("Get = %q,%v", sid, ok)
	}
	c.Drop(1)
	if _, ok := c.Get(1); ok {
		t.Error("после Drop запись должна исчезнуть (logout действует сразу)")
	}
	c.Put(2, "s2")
	time.Sleep(50 * time.Millisecond)
	if _, ok := c.Get(2); ok {
		t.Error("запись должна истечь по TTL")
	}
	c.Put(3, "a")
	c.Put(4, "b")
	c.Put(5, "c")
	if len(c.m) > 2 {
		t.Errorf("размер кэша %d превышает max", len(c.m))
	}
}

func TestSessionCacheDisabled(t *testing.T) {
	c := NewSessionCache(0, 10)
	c.Put(1, "s")
	if _, ok := c.Get(1); ok {
		t.Error("при TTL=0 кэш должен быть выключен")
	}
}
