package httpapi

import (
	"net/http"
	"regexp"
)

// id клипа Listening: латиница, цифры, дефис и подчёркивание (как в listening-data.js).
var listeningClipRe = regexp.MustCompile(`^[a-z0-9_-]{1,60}$`)

const (
	listeningMaxPhrases = 200 // фраз в одном клипе
	listeningHistoryCap = 50  // записей в ответе с историей
)

// validListeningResult — результат клипа: 0–100 % за прохождение и столько же по каждой фразе.
func validListeningResult(clip string, score int, phrases []int) bool {
	if !listeningClipRe.MatchString(clip) || score < 0 || score > 100 || len(phrases) > listeningMaxPhrases {
		return false
	}
	for _, p := range phrases {
		if p < 0 || p > 100 {
			return false
		}
	}
	return true
}

func (s *Server) writeListeningProgress(w http.ResponseWriter, r *http.Request) {
	p, err := s.store.ListeningProgress(r.Context(), currentUID(r))
	if err != nil {
		s.dbError(w, r, "прогресс Listening", err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"progress": p})
}

// GET /api/listening — лучший/последний результат и число прохождений по клипам текущего пользователя.
func (s *Server) handleListeningGet(w http.ResponseWriter, r *http.Request) {
	s.writeListeningProgress(w, r)
}

// POST /api/listening/result {clip, score, phrases[]} — записать одно прохождение клипа.
func (s *Server) handleListeningSave(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Clip    string `json:"clip"`
		Score   int    `json:"score"`
		Phrases []int  `json:"phrases"`
	}
	if err := decode(w, r, &in); err != nil || !validListeningResult(in.Clip, in.Score, in.Phrases) {
		writeError(w, http.StatusBadRequest, "Некорректный результат")
		return
	}
	if err := s.store.SaveListeningResult(r.Context(), currentUID(r), in.Clip, in.Score, in.Phrases); err != nil {
		s.dbError(w, r, "прогресс Listening", err)
		return
	}
	s.writeListeningProgress(w, r)
}

// GET /api/listening/history — последние прохождения (по фразам) текущего пользователя.
func (s *Server) handleListeningHistory(w http.ResponseWriter, r *http.Request) {
	h, err := s.store.ListeningHistory(r.Context(), currentUID(r), listeningHistoryCap)
	if err != nil {
		s.dbError(w, r, "история Listening", err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"history": h})
}
