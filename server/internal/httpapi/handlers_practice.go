package httpapi

import (
	"net/http"
	"regexp"

	"marshrut-api/internal/store"
)

var practiceUnitRe = regexp.MustCompile(`^[a-z0-9_-]{1,40}$`)

func (s *Server) handlePracticeGet(w http.ResponseWriter, r *http.Request) {
	p, err := s.store.PracticeProgress(r.Context(), currentUID(r))
	if err != nil {
		s.dbError(w, r, "прогресс практики", err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"progress": p})
}

func (s *Server) handlePracticeSave(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Unit  string `json:"unit"`
		Right int    `json:"right"`
	}
	if err := decode(w, r, &in); err != nil || !practiceUnitRe.MatchString(in.Unit) || in.Right < 0 || in.Right > 1000 {
		writeError(w, http.StatusBadRequest, "Некорректный результат")
		return
	}
	if err := s.store.SavePracticeResult(r.Context(), currentUID(r), in.Unit, in.Right); err != nil {
		s.dbError(w, r, "прогресс практики", err)
		return
	}
	s.handlePracticeGet(w, r)
}

// handlePracticeImport — разовый перенос прогресса из localStorage.
func (s *Server) handlePracticeImport(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Progress map[string]store.PracticeUnit `json:"progress"`
	}
	if err := decode(w, r, &in); err != nil || len(in.Progress) > 100 {
		writeError(w, http.StatusBadRequest, "Некорректные данные")
		return
	}
	clean := map[string]store.PracticeUnit{}
	for id, u := range in.Progress {
		if practiceUnitRe.MatchString(id) && u.Best >= 0 && u.Best <= 1000 && u.Last >= 0 && u.Last <= 1000 && u.Tries >= 0 && u.Tries <= 100000 {
			clean[id] = u
		}
	}
	if err := s.store.ImportPracticeProgress(r.Context(), currentUID(r), clean); err != nil {
		s.dbError(w, r, "прогресс практики", err)
		return
	}
	s.handlePracticeGet(w, r)
}
