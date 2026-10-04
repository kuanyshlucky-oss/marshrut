//go:build integration

package httpapi

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

// Страницы конспектов отдаются только вошедшему пользователю с доступом к курсу;
// общие курсы — любому вошедшему; без токена — никому.
func TestKonspektImageAccess(t *testing.T) {
	dir := t.TempDir()
	for _, c := range []string{"m115-burenie-course", "tgo-kriticheskoe-course"} {
		if err := os.MkdirAll(filepath.Join(dir, c), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, c, "page-1.jpg"), []byte("JPEGDATA"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	e := newEnvWith(t, func(_ context.Context, s *Server) { s.cfg.KonspektDir = dir })

	withAccess, email, pw := e.mkUser("Konspekt")
	e.grant(withAccess, "M115", "ru")
	tokWith := e.mustLogin(email, pw)
	_, email2, pw2 := e.mkUser("Nokonspekt")
	tokWithout := e.mustLogin(email2, pw2)

	const priv = "/api/konspekt/m115-burenie-course/page-1.jpg"
	const common = "/api/konspekt/tgo-kriticheskoe-course/page-1.jpg"
	cases := []struct {
		name, path, tok string
		want            int
	}{
		{"без токена", priv, "", 401},
		{"с доступом к M115", priv, tokWith, 200},
		{"без доступа к M115", priv, tokWithout, 403},
		{"общий курс — любому вошедшему", common, tokWithout, 200},
		{"общий курс без токена", common, "", 401},
		{"чужая папка", "/api/konspekt/m103-dm-course/page-1.jpg", tokWith, 403},
		{"неизвестный курс", "/api/konspekt/nope/page-1.jpg", tokWith, 404},
	}
	for _, c := range cases {
		var opts []opt
		if c.tok != "" {
			opts = append(opts, bearer(c.tok))
		}
		code, hdr, body := e.do("GET", c.path, nil, opts...)
		if code != c.want {
			t.Errorf("%s: код %d, want %d", c.name, code, c.want)
		}
		if c.want == 200 {
			if string(body) != "JPEGDATA" || hdr.Get("Content-Type") != "image/jpeg" {
				t.Errorf("%s: тело/тип: %q %q", c.name, body, hdr.Get("Content-Type"))
			}
		}
	}
}
