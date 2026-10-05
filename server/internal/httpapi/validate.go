package httpapi

import (
	"encoding/base64"
	"regexp"
	"strings"
)

// Пределы входных данных: клиенту не доверяем ни размер, ни формат.
const (
	minAdminPasswordLen = 8
	maxEmailLen         = 254
	maxFieldLen         = 100
	maxTopicLen         = 200 // тема вопроса из банка (официальные названия тем КТ бывают длиннее 100 знаков)
	maxProfileFieldLen  = 200
	maxAvatarDataURLLen = 500_000
	maxScore            = 1000
)

// codeRe — допустимый вид кода направления/теста ("7M01", "M149", "kt:profile"):
// без проверки по каталогу (он живёт на фронте), но без произвольных строк.
var codeRe = regexp.MustCompile(`^[A-Za-z0-9_.:-]{1,40}$`)

func validCode(s string) bool { return codeRe.MatchString(s) }

// normalizeLang приводит язык к внутреннему значению: "kz" — синоним "kk"
// (в ТЗ говорят "kz", а весь остальной код использует ISO-код "kk").
func normalizeLang(s string) string {
	if s == "kk" || s == "kz" {
		return "kk"
	}
	return "ru"
}

// clip обрезает строку по рунам — чтобы поле не раздувало БД.
func clip(s string, max int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) > max {
		r = r[:max]
	}
	return string(r)
}

var avatarPrefixes = []string{
	"data:image/jpeg;base64,",
	"data:image/png;base64,",
	"data:image/webp;base64,",
	"data:image/gif;base64,",
}

// validAvatar принимает только растровые форматы в base64 (SVG может содержать
// скрипты) и проверяет, что содержимое действительно декодируется.
func validAvatar(dataURL string) bool {
	if len(dataURL) > maxAvatarDataURLLen {
		return false
	}
	for _, p := range avatarPrefixes {
		if payload, ok := strings.CutPrefix(dataURL, p); ok {
			_, err := base64.StdEncoding.DecodeString(payload)
			return err == nil && payload != ""
		}
	}
	return false
}
