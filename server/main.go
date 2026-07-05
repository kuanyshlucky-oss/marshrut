// Маршрут — API-сервер (Go + SQLite).
// Заменяет localStorage-«бэкенд» фронтенда на настоящий REST API:
// регистрация/логин (bcrypt + токен), профиль, избранные направления,
// результаты тестов. Хранилище — SQLite (файл).
package main

import (
	"log"
	"net/http"
	"os"
	"strings"
)

// Конфиг из переменных окружения (со значениями по умолчанию для локального запуска).
var (
	allowedOrigin = env("ALLOWED_ORIGIN", "*")                       // домен фронта, напр. https://kuanyshlucky-oss.github.io
	jwtSecret     = []byte(env("JWT_SECRET", "dev-secret-change-me")) // секрет для подписи токенов
	adminKey      = env("ADMIN_KEY", "")                             // ключ для /api/admin/users (пусто = выключено)
)

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	port := env("PORT", "8080")
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("не задан DATABASE_URL (строка подключения к Postgres, напр. от Neon)")
	}

	if err := initDB(dsn); err != nil {
		log.Fatalf("ошибка инициализации БД: %v", err)
	}
	if err := initTrack(); err != nil {
		log.Fatalf("ошибка инициализации справочников: %v", err)
	}
	log.Print("БД готова (Postgres)")

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", handleHealth)
	mux.HandleFunc("POST /api/auth/register", handleRegister)
	mux.HandleFunc("POST /api/auth/login", handleLogin)
	mux.HandleFunc("GET /api/me", auth(handleMe))
	mux.HandleFunc("PUT /api/profile", auth(handleUpdateProfile))
	mux.HandleFunc("POST /api/favorites/toggle", auth(handleToggleFavorite))
	mux.HandleFunc("POST /api/results", auth(handleSaveResult))
	mux.HandleFunc("GET /api/admin/users", handleAdminUsers)
	mux.HandleFunc("POST /api/admin/create-user", handleAdminCreate)
	mux.HandleFunc("POST /api/admin/delete-user", handleAdminDelete)
	// МагистрТрек
	mux.HandleFunc("GET /api/universities", handleUniversities)
	mux.HandleFunc("GET /api/specialities", handleSpecialities)
	mux.HandleFunc("GET /api/heatmap", handleHeatmap)
	mux.HandleFunc("GET /api/calculate-chances", auth(handleCalculate))
	mux.HandleFunc("GET /api/roadmap", auth(handleRoadmap))
	mux.HandleFunc("POST /api/roadmap/toggle", auth(handleRoadmapToggle))

	log.Printf("Сервер слушает :%s (CORS origin: %s)", port, allowedOrigin)
	if err := http.ListenAndServe(":"+port, withCORS(mux)); err != nil {
		log.Fatal(err)
	}
}

// withCORS добавляет CORS-заголовки и отвечает на preflight OPTIONS.
// Авторизация — через заголовок Authorization: Bearer <token>, не cookie,
// поэтому Allow-Credentials не нужен, а origin можно оставить "*".
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", resolveOrigin(r.Header.Get("Origin")))
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// resolveOrigin возвращает значение для Access-Control-Allow-Origin.
// Поддерживает "*", список origin через запятую в ALLOWED_ORIGIN,
// и всегда разрешает localhost/127.0.0.1 (для локальной разработки).
func resolveOrigin(reqOrigin string) string {
	if allowedOrigin == "*" || reqOrigin == "" {
		return allowedOrigin
	}
	for _, o := range strings.Split(allowedOrigin, ",") {
		if strings.TrimSpace(o) == reqOrigin {
			return reqOrigin
		}
	}
	if strings.HasPrefix(reqOrigin, "http://localhost:") || strings.HasPrefix(reqOrigin, "http://127.0.0.1:") {
		return reqOrigin
	}
	// file:// (страница открыта с диска) шлёт Origin: null — разрешаем:
	// авторизация у нас не на CORS, а на ключах/токенах
	if reqOrigin == "null" {
		return "null"
	}
	return allowedOrigin
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
