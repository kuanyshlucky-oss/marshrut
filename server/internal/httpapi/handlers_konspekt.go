package httpapi

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"marshrut-api/internal/store"
)

// konspektCourses — какие коды направлений открывают курс конспектов (картинки страниц).
// Пустой список = общий курс (ТГО, английский): виден любому вошедшему пользователю.
// Мобильная версия курса лежит в папке с суффиксом «-m» и наследует доступ основного.
// Должно совпадать с LIBRARY_CONSPECTS / COMMON_CONSPECTS на фронтенде (script.js);
// тест проверяет, что у каждой папки на диске есть запись здесь.
var konspektCourses = map[string][]string{
	"pedagogika-course":            {"7M01", "M005"},
	"psihologiya-course":           {"7M01"},
	"pedagogika":                   {"7M01"},
	"psikhologiya":                 {"7M01"},
	"geodezia-2-course":            {"M123"},
	"kartografiya-course":          {"M123"},
	"obshaya-psihologiya-course":   {"M066"},
	"psihologiya-razvitiya-course": {"M066"},
	"m005-tmfk-course":             {"M005"},
	"m103-ovz-course":              {"M103"},
	"m103-dm-course":               {"M103"},
	"m107-fizika-course":           {"M107"},
	"m107-matematika-course":       {"M107"},
	"m115-burenie-course":          {"M115"},
	"m115-dobycha-course":          {"M115"},
	"tgo-kriticheskoe-course":      nil,
	"tgo-analiticheskoe-course":    nil,
	"english-themes-course":        nil,
	"english-grammar-course":       nil,
}

var konspektFileRe = regexp.MustCompile(`^page-[0-9]{1,3}\.jpg$`)

// konspektCodes возвращает коды, дающие доступ к папке курса. ok=false — такой папки нет.
func konspektCodes(course string) (codes []string, ok bool) {
	codes, ok = konspektCourses[strings.TrimSuffix(course, "-m")]
	return codes, ok
}

// konspektImagePath собирает путь к файлу под dir, не выпуская за его пределы.
func konspektImagePath(dir, course, file string) (string, bool) {
	if _, ok := konspektCodes(course); !ok || !konspektFileRe.MatchString(file) {
		return "", false
	}
	if course != filepath.Base(course) || strings.ContainsAny(course, `/\`) {
		return "", false
	}
	return filepath.Join(dir, course, file), true
}

// handleKonspektImage — GET /api/konspekt/{course}/{file}: страница конспекта (JPG)
// только тем, у кого есть доступ к курсу. Файлы лежат вне публичной статики фронтенда.
func (s *Server) handleKonspektImage(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(ctxUserID).(int64)
	s.serveKonspekt(w, r, func(codes []string) (bool, error) {
		for _, c := range codes {
			ok, err := s.store.HasAnyAccess(r.Context(), uid, c)
			if err != nil || ok {
				return ok, err
			}
		}
		return false, nil
	})
}

func (s *Server) serveKonspekt(w http.ResponseWriter, r *http.Request, hasAccess func(codes []string) (bool, error)) {
	course, file := r.PathValue("course"), r.PathValue("file")
	path, ok := konspektImagePath(s.cfg.KonspektDir, course, file)
	if !ok {
		writeError(w, http.StatusNotFound, "Страница не найдена")
		return
	}
	if codes, _ := konspektCodes(course); len(codes) > 0 {
		allowed, err := hasAccess(codes)
		if errors.Is(err, store.ErrNotFound) {
			allowed, err = false, nil
		}
		if err != nil {
			s.log.Error("проверка доступа к конспекту", "request_id", requestID(r.Context()), "err", err)
			writeError(w, http.StatusServiceUnavailable, "Сервис временно недоступен")
			return
		}
		if !allowed {
			writeError(w, http.StatusForbidden, "Нет доступа к этому конспекту — обратитесь к администратору")
			return
		}
	}
	f, err := os.Open(path)
	if err != nil {
		writeError(w, http.StatusNotFound, "Страница не найдена")
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil || st.IsDir() {
		writeError(w, http.StatusNotFound, "Страница не найдена")
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	// Ответ зависит от пользователя: общим кэшам (CDN, прокси) его хранить нельзя.
	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.Header().Set("Vary", "Authorization")
	http.ServeContent(w, r, file, st.ModTime(), f)
}
