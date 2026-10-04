package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

func (s *Store) CreateUser(ctx context.Context, name, email, passwordHash string) (int64, error) {
	var id int64
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO users(name, email, password_hash, full_name, created_at)
		 VALUES($1, $2, $3, $4, $5) RETURNING id`,
		name, email, passwordHash, name, time.Now().UTC().Format(time.RFC3339),
	).Scan(&id)
	if isUniqueViolation(err) {
		return 0, ErrEmailTaken
	}
	return id, err
}

// UserAuth возвращает id и хеш пароля для проверки при входе.
func (s *Store) UserAuth(ctx context.Context, email string) (id int64, hash string, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT id, password_hash FROM users WHERE email = $1`, email).Scan(&id, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	return
}

// LoadUser собирает полного пользователя: профиль + избранное + результаты +
// статистику по темам + доступы. Один запрос вместо пяти: каждая мутация на
// фронте возвращает пользователя целиком, а соединений в пуле всего несколько.
func (s *Store) LoadUser(ctx context.Context, id int64) (*User, error) {
	u := &User{Favorites: []string{}, Results: []Result{}, Access: []string{}, TopicStats: []TopicStat{}}
	var favJSON, resJSON, topicJSON, accJSON []byte
	err := s.db.QueryRowContext(ctx,
		`SELECT u.name, u.email, u.full_name, u.phone, u.education, u.city,
		        u.speciality_id, u.language, u.target_type, u.foreign_score, u.profile_score, u.bonus_points, u.avatar,
		        COALESCE((SELECT json_agg(f.code ORDER BY f.code) FROM favorites f WHERE f.user_id = u.id), '[]'),
		        COALESCE((SELECT json_agg(json_build_object(
		                'code', r.code, 'score', r.score, 'total', r.total, 'date', r.date,
		                'kind', r.kind, 'passed', r.passed, 'section', r.section, 'attemptId', r.attempt_id) ORDER BY r.id)
		                FROM results r WHERE r.user_id = u.id), '[]'),
		        COALESCE((SELECT json_agg(json_build_object(
		                'code', t.code, 'section', t.section, 'topic', t.topic,
		                'correct', t.correct, 'wrong', t.wrong) ORDER BY t.id)
		                FROM topic_stats t WHERE t.user_id = u.id), '[]'),
		        -- DISTINCT: доступ к одному коду может быть на обоих языках (ru и kk),
		        -- для карточек «мои направления» язык не важен, только код.
		        COALESCE((SELECT json_agg(a.code ORDER BY a.code)
		                FROM (SELECT DISTINCT code FROM test_access WHERE user_id = u.id) a), '[]')
		 FROM users u WHERE u.id = $1`, id,
	).Scan(&u.Name, &u.Email, &u.Profile.FullName, &u.Profile.Phone, &u.Profile.Education, &u.Profile.City,
		&u.Profile.SpecialityID, &u.Profile.Language, &u.Profile.TargetType,
		&u.Profile.ForeignScore, &u.Profile.ProfileScore, &u.Profile.BonusPoints, &u.Profile.Avatar,
		&favJSON, &resJSON, &topicJSON, &accJSON)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	for _, p := range []struct {
		raw []byte
		dst any
	}{{favJSON, &u.Favorites}, {resJSON, &u.Results}, {topicJSON, &u.TopicStats}, {accJSON, &u.Access}} {
		if err := json.Unmarshal(p.raw, p.dst); err != nil {
			return nil, err
		}
	}
	return u, nil
}

func (s *Store) UpdateProfile(ctx context.Context, id int64, p Profile) error {
	// name в шапке = ФИО (как во фронтенде); если ФИО пустое — name не трогаем
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET
			full_name = $1, phone = $2, education = $3, city = $4,
			speciality_id = $5, language = $6, target_type = $7,
			foreign_score = $8, profile_score = $9, bonus_points = $10,
			name = CASE WHEN $1 <> '' THEN $1 ELSE name END
		 WHERE id = $11`,
		p.FullName, p.Phone, p.Education, p.City,
		p.SpecialityID, p.Language, p.TargetType,
		p.ForeignScore, p.ProfileScore, p.BonusPoints, id,
	)
	return err
}

// SetAvatar сохраняет (или очищает, если dataURL == "") аватар пользователя.
func (s *Store) SetAvatar(ctx context.Context, id int64, dataURL string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE users SET avatar = $1 WHERE id = $2`, dataURL, id)
	return err
}

// ToggleFavorite убирает направление из избранного, а если его там не было —
// добавляет (не больше MaxFavorites на пользователя).
func (s *Store) ToggleFavorite(ctx context.Context, id int64, code string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM favorites WHERE user_id = $1 AND code = $2`, id, code)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return nil
	}
	// вставка только если лимит не исчерпан — одним запросом, без гонки «проверил-вставил»
	res, err = s.db.ExecContext(ctx,
		`INSERT INTO favorites(user_id, code)
		 SELECT $1::bigint, $2::text WHERE (SELECT COUNT(*) FROM favorites WHERE user_id = $1::bigint) < $3::int
		 ON CONFLICT DO NOTHING`, id, code, MaxFavorites)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		// 0 строк: либо лимит, либо параллельный запрос уже добавил этот код
		var have int
		if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM favorites WHERE user_id = $1 AND code = $2`, id, code).Scan(&have); err != nil {
			return err
		}
		if have == 0 {
			return ErrTooManyFavorites
		}
	}
	return nil
}

// ListUsers — админ-список одним запросом (агрегаты вместо цикла N+1).
func (s *Store) ListUsers(ctx context.Context) ([]AdminUser, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT u.id, u.name, u.email, u.phone, u.education, u.city, u.created_at,
		       COALESCE((SELECT string_agg(f.code, ',' ORDER BY f.code) FROM favorites f WHERE f.user_id = u.id), ''),
		       (SELECT COUNT(*) FROM results r WHERE r.user_id = u.id),
		       COALESCE((SELECT json_agg(json_build_object('code', a.code, 'language', a.language) ORDER BY a.code, a.language)
		                 FROM test_access a WHERE a.user_id = u.id), '[]')
		FROM users u
		ORDER BY u.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []AdminUser{}
	for rows.Next() {
		var u AdminUser
		var favCSV string
		var accessJSON []byte
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Phone, &u.Education, &u.City, &u.CreatedAt, &favCSV, &u.Results, &accessJSON); err != nil {
			return nil, err
		}
		u.Favorites = []string{}
		if favCSV != "" {
			u.Favorites = strings.Split(favCSV, ",")
		}
		u.Access = []AccessGrant{}
		if err := json.Unmarshal(accessJSON, &u.Access); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// SessionID — users.session_id: одна активная сессия на аккаунт.
func (s *Store) SessionID(ctx context.Context, uid int64) (string, error) {
	var sid string
	err := s.db.QueryRowContext(ctx, `SELECT session_id FROM users WHERE id = $1`, uid).Scan(&sid)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	return sid, err
}

func (s *Store) SetSessionID(ctx context.Context, uid int64, sid string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE users SET session_id = $1 WHERE id = $2`, sid, uid)
	return err
}

func (s *Store) SetPasswordHash(ctx context.Context, uid int64, hash string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE users SET password_hash = $1 WHERE id = $2`, hash, uid)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteUser удаляет аккаунт вместе со всеми его данными, атомарно.
func (s *Store) DeleteUser(ctx context.Context, id int64) error {
	return s.inTx(ctx, func(tx *sql.Tx) error {
		for _, table := range []string{"favorites", "results", "topic_stats", "test_access", "user_checklist", "attempts"} {
			if _, err := tx.ExecContext(ctx, `DELETE FROM `+table+` WHERE user_id = $1`, id); err != nil {
				return err
			}
		}
		_, err := tx.ExecContext(ctx, `DELETE FROM users WHERE id = $1`, id)
		return err
	})
}

// ResetProgress очищает результаты тестов и статистику по темам, оставляя сам
// аккаунт (логин/пароль/профиль) нетронутым.
func (s *Store) ResetProgress(ctx context.Context, id int64) error {
	return s.inTx(ctx, func(tx *sql.Tx) error {
		// попытки удаляются вместе с результатами: разбор без результата не нужен
		for _, table := range []string{"results", "topic_stats", "attempts"} {
			if _, err := tx.ExecContext(ctx, `DELETE FROM `+table+` WHERE user_id = $1`, id); err != nil {
				return err
			}
		}
		return nil
	})
}
