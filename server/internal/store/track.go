package store

import (
	"context"
	"database/sql"
	"errors"
)

// МагистрТрек: справочники (вузы, специальности, статистика приёма),
// дорожная карта.

type University struct {
	ID   int     `json:"id"`
	Name string  `json:"name"`
	City string  `json:"city"`
	Lat  float64 `json:"lat"`
	Lng  float64 `json:"lng"`
}

type Speciality struct {
	ID             int     `json:"id"`
	Name           string  `json:"name"`
	Code           string  `json:"code"`
	ProfileSubject string  `json:"profile_subject"`
	KTApplications int     `json:"kt_applications"`
	KTParticipants int     `json:"kt_participants"`
	KTPassed       int     `json:"kt_passed"`
	KTPassedPct    float64 `json:"kt_passed_pct"`
}

type AdmissionRule struct {
	AvgPassingScore float64
	GrantCount      int
	ApplicantsCount int
	MinForeign      int
	MinProfile      int
}

type Recommendation struct {
	UniversityID int     `json:"university_id"`
	Name         string  `json:"name"`
	City         string  `json:"city"`
	AvgScore     float64 `json:"avg_score"`
	Ratio        float64 `json:"competition_ratio"`
}

type RoadmapStep struct {
	TemplateID  int64  `json:"template_id"`
	StepOrder   int    `json:"step_order"`
	Description string `json:"description"`
	Deadline    string `json:"deadline"`
	Completed   bool   `json:"completed"`
	CompletedAt string `json:"completed_at,omitempty"`
}

func (s *Store) Universities(ctx context.Context) ([]University, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, city, lat, lng FROM universities ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []University{}
	for rows.Next() {
		var u University
		if err := rows.Scan(&u.ID, &u.Name, &u.City, &u.Lat, &u.Lng); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *Store) Specialities(ctx context.Context) ([]Speciality, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, code, profile_subject, kt_applications, kt_participants, kt_passed, kt_passed_pct
		FROM specialities ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Speciality{}
	for rows.Next() {
		var sp Speciality
		if err := rows.Scan(&sp.ID, &sp.Name, &sp.Code, &sp.ProfileSubject, &sp.KTApplications, &sp.KTParticipants, &sp.KTPassed, &sp.KTPassedPct); err != nil {
			return nil, err
		}
		out = append(out, sp)
	}
	return out, rows.Err()
}

// SpecialityStats — статистика КТ по одной группе; ErrNotFound, если её нет.
func (s *Store) SpecialityStats(ctx context.Context, id int) (Speciality, error) {
	var sp Speciality
	sp.ID = id
	err := s.db.QueryRowContext(ctx, `
		SELECT kt_applications, kt_participants, kt_passed, kt_passed_pct
		FROM specialities WHERE id = $1`, id).Scan(&sp.KTApplications, &sp.KTParticipants, &sp.KTPassed, &sp.KTPassedPct)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	return sp, err
}

// LatestAdmissionRule — правила приёма последнего года для пары вуз+специальность.
func (s *Store) LatestAdmissionRule(ctx context.Context, uni, spec int) (AdmissionRule, error) {
	var r AdmissionRule
	err := s.db.QueryRowContext(ctx, `
		SELECT avg_passing_score, grant_count, applicants_count, min_foreign_score, min_profile_score
		FROM admission_rules WHERE university_id = $1 AND speciality_id = $2
		ORDER BY year DESC LIMIT 1`, uni, spec).Scan(&r.AvgPassingScore, &r.GrantCount, &r.ApplicantsCount, &r.MinForeign, &r.MinProfile)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	return r, err
}

// Recommendations — другие вузы этой специальности с меньшим проходным баллом.
func (s *Store) Recommendations(ctx context.Context, spec, exceptUni int) ([]Recommendation, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT u.id, u.name, u.city, ar.avg_passing_score,
		       CASE WHEN ar.grant_count > 0 THEN ar.applicants_count::float / ar.grant_count ELSE 0 END AS ratio
		FROM admission_rules ar JOIN universities u ON u.id = ar.university_id
		WHERE ar.speciality_id = $1 AND ar.university_id <> $2
		ORDER BY ar.avg_passing_score ASC LIMIT 3`, spec, exceptUni)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Recommendation{}
	for rows.Next() {
		var r Recommendation
		if err := rows.Scan(&r.UniversityID, &r.Name, &r.City, &r.AvgScore, &r.Ratio); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// Roadmap возвращает шаги дорожной карты пользователя на год; при первом
// обращении копирует шаги из шаблона. kk выбирает казахское описание (с откатом на русское).
func (s *Store) Roadmap(ctx context.Context, uid int64, year int, kk bool) ([]RoadmapStep, error) {
	descCol := "t.description"
	if kk {
		descCol = "COALESCE(NULLIF(t.description_kk, ''), t.description)"
	}
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO user_checklist(user_id, template_id)
		SELECT $1, id FROM checklist_templates WHERE year = $2
		ON CONFLICT (user_id, template_id) DO NOTHING`, uid, year); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT t.id, t.step_order, `+descCol+`, t.deadline::text, uc.completed, COALESCE(uc.completed_at::text, '')
		FROM user_checklist uc JOIN checklist_templates t ON t.id = uc.template_id
		WHERE uc.user_id = $1 AND t.year = $2
		ORDER BY t.step_order`, uid, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	steps := []RoadmapStep{}
	for rows.Next() {
		var st RoadmapStep
		if err := rows.Scan(&st.TemplateID, &st.StepOrder, &st.Description, &st.Deadline, &st.Completed, &st.CompletedAt); err != nil {
			return nil, err
		}
		steps = append(steps, st)
	}
	return steps, rows.Err()
}

func (s *Store) ToggleRoadmapStep(ctx context.Context, uid, templateID int64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE user_checklist SET
			completed = NOT completed,
			completed_at = CASE WHEN NOT completed THEN NOW() ELSE NULL END
		WHERE user_id = $1 AND template_id = $2`, uid, templateID)
	return err
}
