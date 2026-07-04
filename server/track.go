package main

// МагистрТрек: справочники (вузы, специальности, статистика приёма),
// дорожная карта, калькулятор шансов, тепловая карта.

import (
	"net/http"
	"time"
)

/* ---------------- Схема и сид ---------------- */

func initTrack() error {
	schema := `
	CREATE TABLE IF NOT EXISTS universities (
		id   INT PRIMARY KEY,
		name TEXT NOT NULL,
		city TEXT NOT NULL,
		lat  DOUBLE PRECISION NOT NULL,
		lng  DOUBLE PRECISION NOT NULL
	);
	CREATE TABLE IF NOT EXISTS specialities (
		id              INT PRIMARY KEY,
		name            TEXT NOT NULL,
		code            TEXT NOT NULL,
		profile_subject TEXT NOT NULL
	);
	CREATE TABLE IF NOT EXISTS admission_rules (
		id                BIGSERIAL PRIMARY KEY,
		university_id     INT NOT NULL,
		speciality_id     INT NOT NULL,
		year              INT NOT NULL,
		min_foreign_score INT NOT NULL,
		min_profile_score INT NOT NULL,
		grant_count       INT NOT NULL,
		avg_passing_score DOUBLE PRECISION NOT NULL,
		applicants_count  INT NOT NULL,
		UNIQUE(university_id, speciality_id, year)
	);
	CREATE TABLE IF NOT EXISTS checklist_templates (
		id          BIGSERIAL PRIMARY KEY,
		year        INT NOT NULL,
		step_order  INT NOT NULL,
		description TEXT NOT NULL,
		deadline    DATE NOT NULL,
		UNIQUE(year, step_order)
	);
	CREATE TABLE IF NOT EXISTS user_checklist (
		id           BIGSERIAL PRIMARY KEY,
		user_id      BIGINT NOT NULL,
		template_id  BIGINT NOT NULL,
		completed    BOOLEAN NOT NULL DEFAULT FALSE,
		completed_at TIMESTAMPTZ,
		UNIQUE(user_id, template_id)
	);
	-- расширение профиля пользователя
	ALTER TABLE users ADD COLUMN IF NOT EXISTS speciality_id INT NOT NULL DEFAULT 0;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS language      TEXT NOT NULL DEFAULT '';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS target_type   TEXT NOT NULL DEFAULT '';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS foreign_score INT NOT NULL DEFAULT 0;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_score INT NOT NULL DEFAULT 0;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_points  INT NOT NULL DEFAULT 0;
	`
	if _, err := db.Exec(schema); err != nil {
		return err
	}
	return seedTrack()
}

func seedTrack() error {
	// Вузы
	if _, err := db.Exec(`INSERT INTO universities(id, name, city, lat, lng) VALUES
		(1, 'Казахский национальный университет им. аль-Фараби', 'Алматы', 43.2551, 76.9126),
		(2, 'Евразийский национальный университет им. Л.Н. Гумилева', 'Астана', 51.1605, 71.4704),
		(3, 'Satbayev University (КазНИТУ им. Сатпаева)', 'Алматы', 43.2364, 76.9293)
		ON CONFLICT (id) DO NOTHING`); err != nil {
		return err
	}
	// Специальности
	if _, err := db.Exec(`INSERT INTO specialities(id, name, code, profile_subject) VALUES
		(1, 'Информационные технологии (IT)', '7M06', 'Информатика'),
		(2, 'Экономика', '7M04', 'Экономика'),
		(3, 'Юриспруденция', '7M03', 'Право'),
		(4, 'Педагогика и психология', '7M01', 'Педагогика, психология')
		ON CONFLICT (id) DO NOTHING`); err != nil {
		return err
	}
	// Статистика приёма 2025 (NULL-строки Satbayev не заводим — приёма нет)
	if _, err := db.Exec(`INSERT INTO admission_rules
		(university_id, speciality_id, year, min_foreign_score, min_profile_score, grant_count, avg_passing_score, applicants_count) VALUES
		(1, 1, 2025, 25, 25, 35, 131, 320),
		(1, 2, 2025, 25, 25, 20, 127, 280),
		(1, 3, 2025, 25, 25, 15, 138, 350),
		(1, 4, 2025, 25, 25, 25, 112, 180),
		(2, 1, 2025, 25, 25, 30, 125, 290),
		(2, 2, 2025, 25, 25, 25, 122, 250),
		(2, 3, 2025, 25, 25, 20, 134, 310),
		(2, 4, 2025, 25, 25, 30, 108, 160),
		(3, 1, 2025, 25, 25, 40, 135, 380),
		(3, 2, 2025, 25, 25, 15, 119, 190)
		ON CONFLICT (university_id, speciality_id, year) DO NOTHING`); err != nil {
		return err
	}
	// Шаблон дорожной карты 2026
	_, err := db.Exec(`INSERT INTO checklist_templates(year, step_order, description, deadline) VALUES
		(2026, 1, 'Зарегистрироваться на Комплексное тестирование (КТ) на сайте Национального центра тестирования', '2026-08-05'),
		(2026, 2, 'Сдать КТ (иностранный язык + профильный предмет)', '2026-08-10'),
		(2026, 3, 'Получить электронный сертификат КТ с баллами', '2026-08-12'),
		(2026, 4, 'Подать заявление и документы в приёмную комиссию вуза (онлайн или очно)', '2026-08-20'),
		(2026, 5, 'Пройти собеседование (если требуется педагогической специальностью)', '2026-08-22'),
		(2026, 6, 'Участие в конкурсе государственных грантов (автоматически)', '2026-08-25'),
		(2026, 7, 'Заключить договор и принести оригиналы документов в вуз', '2026-08-30'),
		(2026, 8, 'Приказ о зачислении', '2026-08-31')
		ON CONFLICT (year, step_order) DO NOTHING`)
	return err
}

/* ---------------- Справочники (публичные) ---------------- */

func handleUniversities(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`SELECT id, name, city, lat, lng FROM universities ORDER BY id`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Ошибка сервера")
		return
	}
	defer rows.Close()
	type U struct {
		ID   int     `json:"id"`
		Name string  `json:"name"`
		City string  `json:"city"`
		Lat  float64 `json:"lat"`
		Lng  float64 `json:"lng"`
	}
	out := []U{}
	for rows.Next() {
		var u U
		rows.Scan(&u.ID, &u.Name, &u.City, &u.Lat, &u.Lng)
		out = append(out, u)
	}
	writeJSON(w, http.StatusOK, out)
}

func handleSpecialities(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`SELECT id, name, code, profile_subject FROM specialities ORDER BY id`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Ошибка сервера")
		return
	}
	defer rows.Close()
	type S struct {
		ID             int    `json:"id"`
		Name           string `json:"name"`
		Code           string `json:"code"`
		ProfileSubject string `json:"profile_subject"`
	}
	out := []S{}
	for rows.Next() {
		var s S
		rows.Scan(&s.ID, &s.Name, &s.Code, &s.ProfileSubject)
		out = append(out, s)
	}
	writeJSON(w, http.StatusOK, out)
}

/* ---------------- Тепловая карта (публичная) ---------------- */

func handleHeatmap(w http.ResponseWriter, r *http.Request) {
	spec := r.URL.Query().Get("speciality_id")
	if spec == "" {
		writeError(w, http.StatusBadRequest, "Не указана speciality_id")
		return
	}
	rows, err := db.Query(`
		SELECT u.id, u.name, u.city, u.lat, u.lng, ar.grant_count, ar.avg_passing_score, ar.applicants_count
		FROM admission_rules ar JOIN universities u ON u.id = ar.university_id
		WHERE ar.speciality_id = $1 AND ar.year = (SELECT MAX(year) FROM admission_rules WHERE speciality_id = $1)
		ORDER BY u.id`, spec)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Ошибка сервера")
		return
	}
	defer rows.Close()
	type H struct {
		UniversityID     int     `json:"university_id"`
		Name             string  `json:"name"`
		City             string  `json:"city"`
		Lat              float64 `json:"lat"`
		Lng              float64 `json:"lng"`
		CompetitionRatio float64 `json:"competition_ratio"`
		AvgScore         float64 `json:"avg_score"`
		GrantCount       int     `json:"grant_count"`
	}
	out := []H{}
	for rows.Next() {
		var h H
		var applicants int
		rows.Scan(&h.UniversityID, &h.Name, &h.City, &h.Lat, &h.Lng, &h.GrantCount, &h.AvgScore, &applicants)
		if h.GrantCount > 0 {
			h.CompetitionRatio = float64(applicants) / float64(h.GrantCount)
		}
		out = append(out, h)
	}
	writeJSON(w, http.StatusOK, out)
}

/* ---------------- Калькулятор шансов (auth) ---------------- */

func handleCalculate(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	uni, spec := q.Get("university_id"), q.Get("speciality_id")
	foreign, profile, bonus := atoiSafe(q.Get("foreign")), atoiSafe(q.Get("profile")), atoiSafe(q.Get("bonus"))
	if uni == "" || spec == "" {
		writeError(w, http.StatusBadRequest, "Укажите университет и специальность")
		return
	}
	total := foreign + profile + bonus

	var avg float64
	var grants, applicants, minF, minP int
	err := db.QueryRow(`
		SELECT avg_passing_score, grant_count, applicants_count, min_foreign_score, min_profile_score
		FROM admission_rules WHERE university_id = $1 AND speciality_id = $2
		ORDER BY year DESC LIMIT 1`, uni, spec).Scan(&avg, &grants, &applicants, &minF, &minP)
	if err != nil {
		writeError(w, http.StatusNotFound, "Нет данных по этой специальности в данном вузе")
		return
	}

	var level, message string
	switch {
	case foreign < minF || profile < minP:
		level = "none"
		message = "Ниже минимального порога (25/25) — к конкурсу не допускают."
	case float64(total) >= avg+5:
		level = "high"
		message = "Высокий шанс: ваш балл заметно выше прошлогоднего среднего проходного."
	case float64(total) >= avg-5:
		level = "medium"
		message = "Средний шанс: вы на уровне прошлогоднего проходного балла — всё решит конкуренция."
	default:
		level = "low"
		message = "Низкий шанс: ваш балл ниже прошлогоднего проходного."
	}

	// Рекомендации при низком шансе: другие вузы этой специальности с меньшим проходным
	type Rec struct {
		UniversityID int     `json:"university_id"`
		Name         string  `json:"name"`
		City         string  `json:"city"`
		AvgScore     float64 `json:"avg_score"`
		Ratio        float64 `json:"competition_ratio"`
	}
	recs := []Rec{}
	if level == "low" || level == "none" {
		rows, err := db.Query(`
			SELECT u.id, u.name, u.city, ar.avg_passing_score,
			       CASE WHEN ar.grant_count > 0 THEN ar.applicants_count::float / ar.grant_count ELSE 0 END AS ratio
			FROM admission_rules ar JOIN universities u ON u.id = ar.university_id
			WHERE ar.speciality_id = $1 AND ar.university_id <> $2
			ORDER BY ar.avg_passing_score ASC LIMIT 3`, spec, uni)
		if err == nil {
			for rows.Next() {
				var rec Rec
				rows.Scan(&rec.UniversityID, &rec.Name, &rec.City, &rec.AvgScore, &rec.Ratio)
				recs = append(recs, rec)
			}
			rows.Close()
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"total": total, "avg_passing_score": avg,
		"grant_count": grants, "applicants_count": applicants,
		"level": level, "message": message,
		"recommendations": recs,
	})
}

func atoiSafe(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return n
		}
		n = n*10 + int(c-'0')
	}
	return n
}

/* ---------------- Дорожная карта (auth) ---------------- */

type RoadmapStep struct {
	TemplateID  int64  `json:"template_id"`
	StepOrder   int    `json:"step_order"`
	Description string `json:"description"`
	Deadline    string `json:"deadline"`
	Completed   bool   `json:"completed"`
	CompletedAt string `json:"completed_at,omitempty"`
}

// GET /api/roadmap — при первом обращении копирует шаги из шаблона.
func handleRoadmap(w http.ResponseWriter, r *http.Request) {
	uid := currentUID(r)
	year := time.Now().Year()

	// генерация при первом входе: вставляем недостающие шаги текущего года
	if _, err := db.Exec(`
		INSERT INTO user_checklist(user_id, template_id)
		SELECT $1, id FROM checklist_templates WHERE year = $2
		ON CONFLICT (user_id, template_id) DO NOTHING`, uid, year); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать дорожную карту")
		return
	}

	rows, err := db.Query(`
		SELECT t.id, t.step_order, t.description, t.deadline::text, uc.completed, COALESCE(uc.completed_at::text, '')
		FROM user_checklist uc JOIN checklist_templates t ON t.id = uc.template_id
		WHERE uc.user_id = $1 AND t.year = $2
		ORDER BY t.step_order`, uid, year)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Ошибка сервера")
		return
	}
	defer rows.Close()

	steps := []RoadmapStep{}
	done := 0
	for rows.Next() {
		var s RoadmapStep
		rows.Scan(&s.TemplateID, &s.StepOrder, &s.Description, &s.Deadline, &s.Completed, &s.CompletedAt)
		if s.Completed {
			done++
		}
		steps = append(steps, s)
	}
	progress := 0
	if len(steps) > 0 {
		progress = done * 100 / len(steps)
	}
	writeJSON(w, http.StatusOK, map[string]any{"year": year, "progress": progress, "steps": steps})
}

// POST /api/roadmap/toggle {template_id}
func handleRoadmapToggle(w http.ResponseWriter, r *http.Request) {
	uid := currentUID(r)
	var in struct {
		TemplateID int64 `json:"template_id"`
	}
	if err := decode(r, &in); err != nil || in.TemplateID <= 0 {
		writeError(w, http.StatusBadRequest, "Не указан шаг")
		return
	}
	if _, err := db.Exec(`
		UPDATE user_checklist SET
			completed = NOT completed,
			completed_at = CASE WHEN NOT completed THEN NOW() ELSE NULL END
		WHERE user_id = $1 AND template_id = $2`, uid, in.TemplateID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить шаг")
		return
	}
	handleRoadmap(w, r)
}
