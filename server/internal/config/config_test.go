package config

import (
	"strings"
	"testing"
)

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

var good = map[string]string{
	"DATABASE_URL": "postgres://x",
	"JWT_SECRET":   "0123456789abcdef0123456789abcdef",
	"ADMIN_KEY":    "admin-key-admin-key-1234",
}

func with(over map[string]string) map[string]string {
	m := map[string]string{}
	for k, v := range good {
		m[k] = v
	}
	for k, v := range over {
		m[k] = v
	}
	return m
}

func TestLoadDefaults(t *testing.T) {
	c, err := Load(env(good))
	if err != nil {
		t.Fatal(err)
	}
	if c.Port != "8080" || c.TrustedProxyHops != 1 || c.DBMaxConns != 5 || c.SessionCacheTTL.Seconds() != 15 {
		t.Errorf("значения по умолчанию: %+v", c)
	}
	if len(c.AllowedOrigins) != 1 || c.AllowedOrigins[0] != "*" {
		t.Errorf("origins = %v", c.AllowedOrigins)
	}
}

func TestLoadRefusesMissingOrWeakSecrets(t *testing.T) {
	cases := map[string]map[string]string{
		"нет DATABASE_URL":     with(map[string]string{"DATABASE_URL": ""}),
		"нет JWT_SECRET":       with(map[string]string{"JWT_SECRET": ""}),
		"короткий JWT_SECRET":  with(map[string]string{"JWT_SECRET": "short"}),
		"короткий ADMIN_KEY":   with(map[string]string{"ADMIN_KEY": "short"}),
		"мусор в hops":         with(map[string]string{"TRUSTED_PROXY_HOPS": "abc"}),
		"hops вне диапазона":   with(map[string]string{"TRUSTED_PROXY_HOPS": "99"}),
		"пул вне диапазона":    with(map[string]string{"DB_MAX_CONNS": "0"}),
		"кэш сессий вне рамок": with(map[string]string{"SESSION_CACHE_TTL_SEC": "9999"}),
	}
	for name, m := range cases {
		if _, err := Load(env(m)); err == nil {
			t.Errorf("%s: ожидалась ошибка", name)
		}
	}
}

func TestAdminKeyOptional(t *testing.T) {
	if _, err := Load(env(with(map[string]string{"ADMIN_KEY": ""}))); err != nil {
		t.Errorf("пустой ADMIN_KEY (админка выключена) должен быть допустим: %v", err)
	}
}

func TestCSVParsing(t *testing.T) {
	c, err := Load(env(with(map[string]string{
		"ALLOWED_ORIGIN":    " https://a.kz , https://b.kz ,",
		"ADMIN_ALLOWED_IPS": "1.1.1.1, 2.2.2.2",
	})))
	if err != nil {
		t.Fatal(err)
	}
	if len(c.AllowedOrigins) != 2 || c.AllowedOrigins[1] != "https://b.kz" {
		t.Errorf("origins = %v", c.AllowedOrigins)
	}
	if len(c.AdminAllowedIPs) != 2 || c.AdminAllowedIPs[0] != "1.1.1.1" {
		t.Errorf("ips = %v", c.AdminAllowedIPs)
	}
}

func TestWarnings(t *testing.T) {
	c, _ := Load(env(with(map[string]string{"JWT_SECRET": "0123456789abcdef"})))
	joined := strings.Join(c.Warnings(), "|")
	for _, want := range []string{"JWT_SECRET", "ALLOWED_ORIGIN", "ADMIN_ALLOWED_IPS"} {
		if !strings.Contains(joined, want) {
			t.Errorf("нет предупреждения про %s: %v", want, c.Warnings())
		}
	}
	strict, _ := Load(env(with(map[string]string{"ALLOWED_ORIGIN": "https://a.kz", "ADMIN_ALLOWED_IPS": "1.1.1.1"})))
	if w := strict.Warnings(); len(w) != 0 {
		t.Errorf("строгая конфигурация не должна давать предупреждений: %v", w)
	}
}
