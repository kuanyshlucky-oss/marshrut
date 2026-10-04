// Package auth — пароли и самоподписанные токены сессий.
// Токен: base64url(payload) + "." + base64url(HMAC-SHA256(payload)).
// payload = {"uid","sid","exp"}; sid сверяется с users.session_id, поэтому токен
// можно отозвать на сервере (logout / вход с другого устройства).
package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var ErrInvalidToken = errors.New("недействительный токен")

// TokenTTL — срок жизни токена. Реально сессию ограничивает и sid на сервере.
const TokenTTL = 7 * 24 * time.Hour

// MaxPasswordLen — bcrypt учитывает только первые 72 байта; длиннее не принимаем,
// чтобы два разных длинных пароля не считались одинаковыми.
const MaxPasswordLen = 72

// SentinelLoggedOut пишется в users.session_id при logout. Отличается от пустой
// строки (та = «легаси-токен без sid, пропустить») и не совпадёт ни с одним
// реальным sid (в алфавите RandString нет дефиса).
const SentinelLoggedOut = "logged-out-00000000"

type Claims struct {
	UID int64  `json:"uid"`
	SID string `json:"sid"`
	Exp int64  `json:"exp"`
}

type Signer struct {
	secret []byte
	now    func() time.Time
}

func NewSigner(secret []byte) *Signer { return &Signer{secret: secret, now: time.Now} }

func (s *Signer) Make(uid int64, sid string) string {
	raw, _ := json.Marshal(Claims{UID: uid, SID: sid, Exp: s.now().Add(TokenTTL).Unix()})
	payload := base64.RawURLEncoding.EncodeToString(raw)
	return payload + "." + s.sign(payload)
}

func (s *Signer) sign(payload string) string {
	m := hmac.New(sha256.New, s.secret)
	m.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

func (s *Signer) Parse(token string) (Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return Claims{}, ErrInvalidToken
	}
	if !hmac.Equal([]byte(parts[1]), []byte(s.sign(parts[0]))) {
		return Claims{}, ErrInvalidToken
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return Claims{}, ErrInvalidToken
	}
	var c Claims
	if err := json.Unmarshal(raw, &c); err != nil {
		return Claims{}, ErrInvalidToken
	}
	if s.now().Unix() > c.Exp {
		return Claims{}, ErrInvalidToken
	}
	return c, nil
}

// RandString — случайная строка из алфавита без похожих символов (0/O, 1/l/I).
// Отбрасывает байты, дающие перекос по модулю, чтобы распределение было ровным.
func RandString(n int) string {
	const alphabet = "abcdefghijkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	limit := 256 - 256%len(alphabet)
	out := make([]byte, 0, n)
	buf := make([]byte, n*2)
	for len(out) < n {
		if _, err := rand.Read(buf); err != nil {
			panic("crypto/rand недоступен: " + err.Error())
		}
		for _, b := range buf {
			if int(b) < limit && len(out) < n {
				out = append(out, alphabet[int(b)%len(alphabet)])
			}
		}
	}
	return string(out)
}

func GenPassword() string { return RandString(10) }
func GenLogin() string    { return "st-" + RandString(6) + "@marshrut.kz" }

func HashPassword(pw string) (string, error) {
	if len(pw) > MaxPasswordLen {
		return "", errors.New("пароль длиннее 72 байт")
	}
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(b), err
}

func CheckPassword(hash, pw string) bool {
	if len(pw) > MaxPasswordLen {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}
