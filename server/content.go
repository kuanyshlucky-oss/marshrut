package main

import (
	"embed"
	"encoding/json"
	"sort"
	"strings"
)

// gopCodeByDirection — код группы образовательных программ (ГОП, из официальной
// статистики КТ, напр. "M001") для внутреннего кода направления — только для
// удобного отображения в админке, на доступ не влияет.
var gopCodeByDirection = map[string]string{
	"7M01": "M001",
}

// Банки вопросов по направлениям — раньше лежали прямо в публичном script.js
// (значит, были читаемы кем угодно без логина), теперь встроены в бинарник
// сервера и отдаются только через авторизованный API с проверкой доступа
// (см. access.go).
//
//go:embed content/*.json
var contentFS embed.FS

// testContentBytes возвращает сырые байты JSON для кода направления как есть —
// формат файла уже совпадает с тем, что раньше лежало во фронтенде
// (title, questions, bySubject), пересобирать нечего.
func testContentBytes(code string) ([]byte, bool) {
	b, err := contentFS.ReadFile("content/" + code + ".json")
	if err != nil {
		return nil, false
	}
	return b, true
}

// listContentCodes — список кодов направлений, у которых вообще есть контент
// (для админки — чтобы не хардкодить список выдаваемых тестов).
func listContentCodes() []string {
	entries, err := contentFS.ReadDir("content")
	if err != nil {
		return nil
	}
	out := make([]string, 0, len(entries))
	for _, e := range entries {
		name := e.Name()
		if strings.HasSuffix(name, ".json") {
			out = append(out, strings.TrimSuffix(name, ".json"))
		}
	}
	sort.Strings(out)
	return out
}

// ContentInfo — то, что видит админ при выдаче доступа: код + человекочитаемое
// название + код ГОП, если известен (напр. 7M01 → M001).
type ContentInfo struct {
	Code    string `json:"code"`
	GopCode string `json:"gopCode,omitempty"`
	Title   string `json:"title"`
}

func listContentInfo() []ContentInfo {
	codes := listContentCodes()
	out := make([]ContentInfo, 0, len(codes))
	for _, code := range codes {
		info := ContentInfo{Code: code, GopCode: gopCodeByDirection[code]}
		if b, ok := testContentBytes(code); ok {
			var t struct {
				Title string `json:"title"`
			}
			if json.Unmarshal(b, &t) == nil {
				info.Title = t.Title
			}
		}
		out = append(out, info)
	}
	return out
}
