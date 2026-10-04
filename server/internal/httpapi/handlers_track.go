package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"marshrut-api/internal/store"
)

// МагистрТрек: справочники (публичные), калькулятор шансов и дорожная карта (auth).

// GET /api/universities
func (s *Server) handleUniversities(w http.ResponseWriter, r *http.Request) {
	out, err := s.store.Universities(r.Context())
	if err != nil {
		s.dbError(w, r, "вузы", err)
		return
	}
	publicCache(w, 300)
	writeJSON(w, http.StatusOK, out)
}

// GET /api/specialities
func (s *Server) handleSpecialities(w http.ResponseWriter, r *http.Request) {
	out, err := s.store.Specialities(r.Context())
	if err != nil {
		s.dbError(w, r, "специальности", err)
		return
	}
	publicCache(w, 300)
	writeJSON(w, http.StatusOK, out)
}

// atoiSafe читает начальные цифры строки, остальное отбрасывает ("30abc" → 30).
func atoiSafe(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return n
		}
		n = n*10 + int(c-'0')
		if n > 1_000_000 {
			return 1_000_000
		}
	}
	return n
}

// GET /api/calculate-chances?university_id&speciality_id&foreign&profile&bonus
func (s *Server) handleCalculate(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	uniRaw, specRaw := q.Get("university_id"), q.Get("speciality_id")
	if uniRaw == "" || specRaw == "" {
		writeError(w, http.StatusBadRequest, "Укажите университет и специальность")
		return
	}
	foreign, profile, bonus := atoiSafe(q.Get("foreign")), atoiSafe(q.Get("profile")), atoiSafe(q.Get("bonus"))
	total := foreign + profile + bonus
	uni, uniErr := strconv.Atoi(uniRaw)
	spec, specErr := strconv.Atoi(specRaw)

	stats, err := s.store.SpecialityStats(r.Context(), spec)
	if specErr != nil || errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "Специальность не найдена")
		return
	}
	if err != nil {
		s.dbError(w, r, "статистика специальности", err)
		return
	}
	ktStats := map[string]any{
		"applications": stats.KTApplications, "participants": stats.KTParticipants,
		"passed": stats.KTPassed, "passed_pct": stats.KTPassedPct,
	}

	rule, err := s.store.LatestAdmissionRule(r.Context(), uni, spec)
	if uniErr != nil || errors.Is(err, store.ErrNotFound) {
		// По этой группе нет данных о проходных баллах в данном вузе — отдаём
		// хотя бы общестрановую статистику КТ-2025, без выдуманного вердикта о шансах.
		writeJSON(w, http.StatusOK, map[string]any{
			"total": total, "level": "no_data",
			"message": fmt.Sprintf(
				"Пока нет статистики проходных баллов по вузам для этой группы. По стране на КТ-2025 порог набрали %.1f%% из %d участников.",
				stats.KTPassedPct, stats.KTParticipants),
			"kt_stats": ktStats,
		})
		return
	}
	if err != nil {
		s.dbError(w, r, "правила приёма", err)
		return
	}

	var level, message string
	switch {
	case foreign < rule.MinForeign || profile < rule.MinProfile:
		level = "none"
		message = "Ниже минимального порога (25/25) — к конкурсу не допускают."
	case float64(total) >= rule.AvgPassingScore+5:
		level = "high"
		message = "Высокий шанс: ваш балл заметно выше прошлогоднего среднего проходного."
	case float64(total) >= rule.AvgPassingScore-5:
		level = "medium"
		message = "Средний шанс: вы на уровне прошлогоднего проходного балла — всё решит конкуренция."
	default:
		level = "low"
		message = "Низкий шанс: ваш балл ниже прошлогоднего проходного."
	}

	// При низком шансе — другие вузы этой специальности с меньшим проходным.
	recs := []store.Recommendation{}
	if level == "low" || level == "none" {
		if rs, err := s.store.Recommendations(r.Context(), spec, uni); err == nil {
			recs = rs
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"total": total, "avg_passing_score": rule.AvgPassingScore,
		"grant_count": rule.GrantCount, "applicants_count": rule.ApplicantsCount,
		"level": level, "message": message,
		"recommendations": recs,
		"kt_stats":        ktStats,
	})
}

// GET /api/roadmap?lang=kk — при первом обращении копирует шаги из шаблона.
// lang выбирает язык описания шага; любое значение кроме "kk" отдаёт русский.
func (s *Server) handleRoadmap(w http.ResponseWriter, r *http.Request) {
	year := time.Now().Year()
	steps, err := s.store.Roadmap(r.Context(), currentUID(r), year, r.URL.Query().Get("lang") == "kk")
	if err != nil {
		s.dbError(w, r, "дорожная карта", err)
		return
	}
	done := 0
	for _, st := range steps {
		if st.Completed {
			done++
		}
	}
	progress := 0
	if len(steps) > 0 {
		progress = done * 100 / len(steps)
	}
	writeJSON(w, http.StatusOK, map[string]any{"year": year, "progress": progress, "steps": steps})
}

// POST /api/roadmap/toggle {template_id}
func (s *Server) handleRoadmapToggle(w http.ResponseWriter, r *http.Request) {
	var in struct {
		TemplateID int64 `json:"template_id"`
	}
	if err := decode(w, r, &in); err != nil || in.TemplateID <= 0 {
		writeError(w, http.StatusBadRequest, "Не указан шаг")
		return
	}
	if err := s.store.ToggleRoadmapStep(r.Context(), currentUID(r), in.TemplateID); err != nil {
		s.dbError(w, r, "шаг дорожной карты", err)
		return
	}
	s.handleRoadmap(w, r)
}
