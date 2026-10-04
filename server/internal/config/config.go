// Package config читает и проверяет настройки из переменных окружения.
// Всё, что зависит от окружения, живёт здесь: остальные пакеты получают
// готовую структуру и не обращаются к os.Getenv.
package config

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port        string
	DatabaseURL string

	JWTSecret []byte
	AdminKey  string // пусто = /api/admin/* выключен

	// AdminAllowedIPs — необязательный allow-list для /api/admin/*.
	AdminAllowedIPs []string
	// AllowedOrigins — origin'ы фронта для CORS; ["*"] = любой.
	AllowedOrigins []string

	// TrustedProxyHops — сколько прокси перед сервером дописывает X-Forwarded-For.
	TrustedProxyHops int

	DBMaxConns      int
	SessionCacheTTL time.Duration
	LogJSON         bool
}

const (
	minSecretLen  = 16 // ниже — отказ запуска
	warnSecretLen = 32 // ниже — предупреждение
)

// Load читает окружение через getenv (os.Getenv в проде, map в тестах).
// Ошибка = сервер не должен стартовать.
func Load(getenv func(string) string) (*Config, error) {
	env := func(k, def string) string {
		if v := strings.TrimSpace(getenv(k)); v != "" {
			return v
		}
		return def
	}
	c := &Config{
		Port:        env("PORT", "8080"),
		DatabaseURL: strings.TrimSpace(getenv("DATABASE_URL")),
		JWTSecret:   []byte(strings.TrimSpace(getenv("JWT_SECRET"))),
		AdminKey:    strings.TrimSpace(getenv("ADMIN_KEY")),
		LogJSON:     env("LOG_FORMAT", "json") != "text",
	}
	var err error
	if c.TrustedProxyHops, err = envInt(env, "TRUSTED_PROXY_HOPS", 1, 0, 10); err != nil {
		return nil, err
	}
	if c.DBMaxConns, err = envInt(env, "DB_MAX_CONNS", 5, 1, 100); err != nil {
		return nil, err
	}
	ttl, err := envInt(env, "SESSION_CACHE_TTL_SEC", 15, 0, 300)
	if err != nil {
		return nil, err
	}
	c.SessionCacheTTL = time.Duration(ttl) * time.Second

	c.AllowedOrigins = splitCSV(env("ALLOWED_ORIGIN", "*"))
	c.AdminAllowedIPs = splitCSV(env("ADMIN_ALLOWED_IPS", ""))

	if c.DatabaseURL == "" {
		return nil, errors.New("не задан DATABASE_URL (строка подключения к Postgres, напр. от Neon)")
	}
	if len(c.JWTSecret) < minSecretLen {
		return nil, fmt.Errorf("JWT_SECRET не задан или короче %d символов — сгенерируйте длинный случайный секрет "+
			"(openssl rand -base64 48); без него токены можно подделать", minSecretLen)
	}
	if c.AdminKey != "" && len(c.AdminKey) < minSecretLen {
		return nil, fmt.Errorf("ADMIN_KEY короче %d символов — админ-ключ должен быть длинным случайным", minSecretLen)
	}
	return c, nil
}

// Warnings — не критичные, но опасные настройки; печатаются при старте.
func (c *Config) Warnings() []string {
	var w []string
	if len(c.JWTSecret) < warnSecretLen {
		w = append(w, fmt.Sprintf("JWT_SECRET короче %d символов — рекомендуется 32+", warnSecretLen))
	}
	if len(c.AllowedOrigins) == 1 && c.AllowedOrigins[0] == "*" {
		w = append(w, "ALLOWED_ORIGIN=* — CORS открыт для любого сайта; в проде укажите домен фронта")
	}
	if c.AdminKey != "" && len(c.AdminAllowedIPs) == 0 {
		w = append(w, "ADMIN_ALLOWED_IPS не задан — админка доступна с любого IP (защищена только ключом)")
	}
	return w
}

func envInt(env func(string, string) string, key string, def, min, max int) (int, error) {
	raw := env(key, "")
	if raw == "" {
		return def, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < min || n > max {
		return 0, fmt.Errorf("%s=%q: ожидается целое от %d до %d", key, raw, min, max)
	}
	return n, nil
}

func splitCSV(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
