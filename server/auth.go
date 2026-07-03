package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var errInvalidToken = errors.New("недействительный токен")

// Случайная строка из безопасного алфавита (без похожих символов 0/O, 1/l/I).
func randString(n int) string {
	const alphabet = "abcdefghijkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	b := make([]byte, n)
	rand.Read(b)
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b)
}

func genPassword() string { return randString(10) }
func genLogin() string    { return "st-" + randString(6) + "@marshrut.kz" }

func hashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(b), err
}

func checkPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

// --- Простой самоподписанный токен (HMAC-SHA256), формат: base64(payload).base64(sig) ---
// payload = {"uid":<id>,"exp":<unix>}. Без внешних зависимостей.

type tokenClaims struct {
	UID int64 `json:"uid"`
	Exp int64 `json:"exp"`
}

func makeToken(uid int64) string {
	claims := tokenClaims{UID: uid, Exp: time.Now().Add(7 * 24 * time.Hour).Unix()}
	raw, _ := json.Marshal(claims)
	payload := base64.RawURLEncoding.EncodeToString(raw)
	return payload + "." + sign(payload)
}

func sign(payload string) string {
	m := hmac.New(sha256.New, jwtSecret)
	m.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

func parseToken(token string) (int64, error) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return 0, errInvalidToken
	}
	if !hmac.Equal([]byte(parts[1]), []byte(sign(parts[0]))) {
		return 0, errInvalidToken
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return 0, errInvalidToken
	}
	var c tokenClaims
	if err := json.Unmarshal(raw, &c); err != nil {
		return 0, errInvalidToken
	}
	if time.Now().Unix() > c.Exp {
		return 0, errInvalidToken
	}
	return c.UID, nil
}

// --- Мидлвар авторизации ---

type ctxKey int

const userIDKey ctxKey = 0

func auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		uid, err := parseToken(strings.TrimSpace(token))
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Требуется авторизация")
			return
		}
		ctx := context.WithValue(r.Context(), userIDKey, uid)
		next(w, r.WithContext(ctx))
	}
}

func currentUID(r *http.Request) int64 {
	uid, _ := r.Context().Value(userIDKey).(int64)
	return uid
}

// respondAuth отдаёт {token, user} после успешного входа/регистрации.
func respondAuth(w http.ResponseWriter, uid int64) {
	u, err := loadUser(uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить пользователя")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"token": makeToken(uid),
		"user":  u,
	})
}
