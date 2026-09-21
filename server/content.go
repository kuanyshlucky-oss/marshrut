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
// Язык теста определяется именем файла: "<код>.json" — русский (по
// умолчанию, для всех тестов, созданных до появления казахских), "<код>-kk.json"
// — казахский. Один код направления => не больше одного файла на язык.
//
//go:embed content/*.json
var contentFS embed.FS

func contentFileName(code, language string) string {
	if language == "kk" {
		return code + "-kk"
	}
	return code
}

// testContentBytes возвращает сырые байты JSON для кода направления и языка
// как есть — формат файла уже совпадает с тем, что раньше лежало во фронтенде
// (title, questions, bySubject), пересобирать нечего.
func testContentBytes(code, language string) ([]byte, bool) {
	b, err := contentFS.ReadFile("content/" + contentFileName(code, language) + ".json")
	if err != nil {
		return nil, false
	}
	return b, true
}

// contentFile — один физический файл контента: код направления и язык,
// вытащенные из имени файла (см. contentFileName).
type contentFile struct {
	Code     string
	Language string
}

// listContentFiles — все файлы контента, каждый со своим (код, язык).
func listContentFiles() []contentFile {
	entries, err := contentFS.ReadDir("content")
	if err != nil {
		return nil
	}
	out := make([]contentFile, 0, len(entries))
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".json") {
			continue
		}
		base := strings.TrimSuffix(name, ".json")
		if code, ok := strings.CutSuffix(base, "-kk"); ok {
			out = append(out, contentFile{Code: code, Language: "kk"})
		} else {
			out = append(out, contentFile{Code: base, Language: "ru"})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Code != out[j].Code {
			return out[i].Code < out[j].Code
		}
		return out[i].Language < out[j].Language
	})
	return out
}

// ContentInfo — то, что видит админ при выдаче доступа: код + язык +
// человекочитаемое название + код ГОП, если известен (напр. 7M01 → M001).
type ContentInfo struct {
	Code     string `json:"code"`
	Language string `json:"language"`
	GopCode  string `json:"gopCode,omitempty"`
	Title    string `json:"title"`
}

// minQuestionsForAdmin — направления с банком вопросов меньше этого порога
// считаются заглушками (черновиками) и не показываются в админке при выдаче
// доступа, чтобы не путать админа неготовыми тестами.
const minQuestionsForAdmin = 20

// countQuestions читает и "questions" (плоский список), и "bySubject"
// (вопросы по предметам) — оба формата встречаются в контенте направлений.
func countQuestions(b []byte) int {
	var t struct {
		Questions []json.RawMessage            `json:"questions"`
		BySubject map[string][]json.RawMessage `json:"bySubject"`
	}
	if json.Unmarshal(b, &t) != nil {
		return 0
	}
	if len(t.Questions) > 0 {
		return len(t.Questions)
	}
	n := 0
	for _, qs := range t.BySubject {
		n += len(qs)
	}
	return n
}

func listContentInfo() []ContentInfo {
	files := listContentFiles()
	out := make([]ContentInfo, 0, len(files))
	for _, f := range files {
		b, ok := testContentBytes(f.Code, f.Language)
		if !ok || countQuestions(b) < minQuestionsForAdmin {
			continue
		}
		info := ContentInfo{Code: f.Code, Language: f.Language, GopCode: gopCodeByDirection[f.Code]}
		var t struct {
			Title string `json:"title"`
		}
		if json.Unmarshal(b, &t) == nil {
			info.Title = t.Title
		}
		out = append(out, info)
	}
	return out
}
