package httpapi

import (
	"errors"
	"net/http"
	"regexp"
	"strconv"

	"marshrut-api/internal/store"
)

// id клипа Listening: латиница, цифры, дефис и подчёркивание (как в listening-data.js).
var listeningClipRe = regexp.MustCompile(`^[a-z0-9_-]{1,60}$`)

// id прохождения, который клиент генерирует сам (UUID и т.п.): по нему повторная отправка не создаёт дубль.
var listeningAttemptRe = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)

const (
	listeningMaxPhrases = 200 // фраз в одном клипе
	listeningHistoryCap = 50  // записей в ответе с историей
	// listeningRatePerMin — записей результата в минуту на одного пользователя. Клип проходят десятки секунд,
	// так что обычный человек до этого не доходит; скрипт, забивающий таблицу, упрётся в 429.
	listeningRatePerMin = 30
)

// validListeningResult — результат клипа: 0–100 % за прохождение и столько же по каждой фразе.
func validListeningResult(clip, attemptID string, score int, phrases []int) bool {
	if !listeningClipRe.MatchString(clip) || score < 0 || score > 100 || len(phrases) > listeningMaxPhrases {
		return false
	}
	if attemptID != "" && !listeningAttemptRe.MatchString(attemptID) {
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

// POST /api/listening/result {id?, clip, score, phrases[]} — записать одно прохождение клипа.
// id (необязателен) — идентификатор прохождения от клиента: повтор с тем же id ничего не меняет (идемпотентно).
func (s *Server) handleListeningSave(w http.ResponseWriter, r *http.Request) {
	uid := currentUID(r)
	if !s.listeningLimiter.allow(strconv.FormatInt(uid, 10)) {
		writeError(w, http.StatusTooManyRequests, "Слишком часто. Подождите минуту.")
		return
	}
	var in struct {
		ID      string `json:"id"`
		Clip    string `json:"clip"`
		Score   int    `json:"score"`
		Phrases []int  `json:"phrases"`
	}
	if err := decode(w, r, &in); err != nil || !validListeningResult(in.Clip, in.ID, in.Score, in.Phrases) {
		writeError(w, http.StatusBadRequest, "Некорректный результат")
		return
	}
	if _, err := s.store.SaveListeningResult(r.Context(), uid, in.Clip, in.ID, in.Score, in.Phrases); err != nil {
		if errors.Is(err, store.ErrTooManyClips) {
			writeError(w, http.StatusBadRequest, "Некорректный результат")
			return
		}
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
