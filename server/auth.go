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
var errSessionReplaced = errors.New("сессия завершена: выполнен вход с другого устройства")

// sentinelLoggedOut пишется в users.session_id при logout — отличается от пустой
// строки (та означает «легаси-токен без sid, пропустить») и не совпадёт ни с одним
// реальным sid (randString использует свой алфавит без дефиса), поэтому все токены
// пользователя сразу перестают проходить auth(). Без пустых/null-байт — просто TEXT.
const sentinelLoggedOut = "logged-out-00000000"

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
	UID int64  `json:"uid"`
	SID string `json:"sid"` // идентификатор сессии — сверяется с users.session_id (одна активная сессия на аккаунт)
	Exp int64  `json:"exp"`
}

// makeToken создаёт токен для новой сессии sid (генерируется в login/register/create-user).
func makeToken(uid int64, sid string) string {
	claims := tokenClaims{UID: uid, SID: sid, Exp: time.Now().Add(7 * 24 * time.Hour).Unix()}
	raw, _ := json.Marshal(claims)
	payload := base64.RawURLEncoding.EncodeToString(raw)
	return payload + "." + sign(payload)
}

func sign(payload string) string {
	m := hmac.New(sha256.New, jwtSecret)
	m.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

func parseToken(token string) (tokenClaims, error) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return tokenClaims{}, errInvalidToken
	}
	if !hmac.Equal([]byte(parts[1]), []byte(sign(parts[0]))) {
		return tokenClaims{}, errInvalidToken
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return tokenClaims{}, errInvalidToken
	}
	var c tokenClaims
	if err := json.Unmarshal(raw, &c); err != nil {
		return tokenClaims{}, errInvalidToken
	}
	if time.Now().Unix() > c.Exp {
		return tokenClaims{}, errInvalidToken
	}
	return c, nil
}

// --- Мидлвар авторизации ---

type ctxKey int

const userIDKey ctxKey = 0

func auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		claims, err := parseToken(strings.TrimSpace(token))
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Требуется авторизация")
			return
		}
		current, err := getSessionID(claims.UID)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Требуется авторизация")
			return
		}
		// пусто = ещё не логинился этим механизмом (старые токены до этого фикса) — пропускаем разово
		if current != "" && current != claims.SID {
			writeError(w, http.StatusUnauthorized, errSessionReplaced.Error())
			return
		}
		ctx := context.WithValue(r.Context(), userIDKey, claims.UID)
		next(w, r.WithContext(ctx))
	}
}

func currentUID(r *http.Request) int64 {
	uid, _ := r.Context().Value(userIDKey).(int64)
	return uid
}

// respondAuth создаёт новую сессию (вытесняя предыдущую — один активный вход на аккаунт)
// и отдаёт {token, user} после успешного входа/регистрации.
func respondAuth(w http.ResponseWriter, uid int64) {
	sid := randString(16)
	if err := setSessionID(uid, sid); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось начать сессию")
		return
	}
	u, err := loadUser(uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось загрузить пользователя")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"token": makeToken(uid, sid),
		"user":  u,
	})
}
