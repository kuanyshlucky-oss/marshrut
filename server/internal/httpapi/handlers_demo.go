package httpapi

import (
	"encoding/json"
	"net/http"

	"marshrut-api/internal/content"
)

// Демо-режим: GET /api/demo/{code}?lang=ru — бесплатный фиксированный набор вопросов теста
// (см. content.DemoQuestions). Без входа: покупатель оценивает продукт до оплаты.
//
// Ключи и разбор в ответе есть НАМЕРЕННО — но только у этих нескольких вопросов, они открыты
// бесплатно. Запрос не принимает номеров вопросов, отдать по нему весь банк нельзя.

type demoQuestion struct {
	ID           string          `json:"id"`
	Q            string          `json:"q"`
	Options      []string        `json:"options"`
	Correct      json.RawMessage `json:"correct"`
	Multi        bool            `json:"multi,omitempty"`
	Conspect     string          `json:"conspect,omitempty"`
	Why          string          `json:"why,omitempty"`
	Topic        string          `json:"topic,omitempty"`
	Passage      string          `json:"passage,omitempty"`
	Image        string          `json:"image,omitempty"`
	OptionImages []string        `json:"optionImages,omitempty"`
}

func (s *Server) handleDemo(w http.ResponseWriter, r *http.Request) {
	code := r.PathValue("code")
	if !validCode(code) {
		writeError(w, http.StatusBadRequest, "Неверные параметры теста")
		return
	}
	lang := normalizeLang(r.URL.Query().Get("lang"))
	qs := s.content.DemoQuestions(code, lang)
	if len(qs) == 0 {
		writeError(w, http.StatusNotFound, "Демо для этого теста недоступно")
		return
	}
	out := make([]demoQuestion, len(qs))
	for i, q := range qs {
		out[i] = demoQuestion{
			ID: q.FP, Q: q.Q, Options: q.Options, Correct: q.CorrectRaw, Multi: q.Multi,
			Conspect: q.Conspect, Why: q.Why, Topic: q.Topic, Passage: q.Passage, Image: q.Image, OptionImages: q.OptionImages,
		}
	}
	publicCache(w, 300)
	writeJSON(w, http.StatusOK, map[string]any{
		"code": code, "lang": lang, "title": s.content.ProfileTitle(code, lang),
		"size": content.DemoSize(code), "questions": out,
	})
}
