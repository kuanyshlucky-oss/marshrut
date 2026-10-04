package httpapi

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"marshrut-api/internal/config"
)

func konspektRequest(course, file string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/api/konspekt/"+course+"/"+file, nil)
	r.SetPathValue("course", course)
	r.SetPathValue("file", file)
	return r
}

func TestServeKonspekt(t *testing.T) {
	dir := t.TempDir()
	for _, c := range []string{"m115-burenie-course", "m115-burenie-course-m", "tgo-kriticheskoe-course"} {
		if err := os.MkdirAll(filepath.Join(dir, c), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, c, "page-1.jpg"), []byte("JPEGDATA"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	s := testServer(t, func(c *config.Config) { c.KonspektDir = dir })

	allow := func(want ...string) func([]string) (bool, error) {
		return func(codes []string) (bool, error) {
			for _, c := range codes {
				for _, w := range want {
					if c == w {
						return true, nil
					}
				}
			}
			return false, nil
		}
	}
	cases := []struct {
		name, course, file string
		access             func([]string) (bool, error)
		want               int
	}{
		{"есть доступ к направлению", "m115-burenie-course", "page-1.jpg", allow("M115"), http.StatusOK},
		{"мобильная версия наследует доступ", "m115-burenie-course-m", "page-1.jpg", allow("M115"), http.StatusOK},
		{"нет доступа — 403", "m115-burenie-course", "page-1.jpg", allow("M103"), http.StatusForbidden},
		{"общий курс открыт без кодов", "tgo-kriticheskoe-course", "page-1.jpg", allow(), http.StatusOK},
		{"нет такой страницы", "m115-burenie-course", "page-2.jpg", allow("M115"), http.StatusNotFound},
		{"неизвестный курс", "secret-course", "page-1.jpg", allow("M115"), http.StatusNotFound},
		{"выход из папки", "..", "page-1.jpg", allow("M115"), http.StatusNotFound},
		{"выход через имя файла", "m115-burenie-course", "..%2Fpage-1.jpg", allow("M115"), http.StatusNotFound},
		{"не картинка страницы", "m115-burenie-course", "page-1.png", allow("M115"), http.StatusNotFound},
		{"сбой БД — 503, а не 403", "m115-burenie-course", "page-1.jpg",
			func([]string) (bool, error) { return false, errors.New("db down") }, http.StatusServiceUnavailable},
	}
	for _, c := range cases {
		w := httptest.NewRecorder()
		s.serveKonspekt(w, konspektRequest(c.course, c.file), c.access)
		if w.Code != c.want {
			t.Errorf("%s: код %d, want %d", c.name, w.Code, c.want)
		}
		if c.want == http.StatusOK {
			if w.Body.String() != "JPEGDATA" {
				t.Errorf("%s: тело %q", c.name, w.Body.String())
			}
			if cc := w.Header().Get("Cache-Control"); !strings.HasPrefix(cc, "private") {
				t.Errorf("%s: Cache-Control %q — ответ не должен кэшироваться общими кэшами", c.name, cc)
			}
		}
	}
}

// Каждая папка с картинками в private/konspekty должна быть в konspektCourses:
// иначе страницы курса окажутся недоступными (404) или, хуже, без проверки доступа.
func TestKonspektCoursesCoverDisk(t *testing.T) {
	root := filepath.Join("..", "..", "private", "konspekty")
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Skipf("папка с конспектами не найдена (%v) — пропуск", err)
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		if _, ok := konspektCodes(e.Name()); !ok {
			t.Errorf("папка %q есть на диске, но нет в konspektCourses", e.Name())
		}
	}
}
