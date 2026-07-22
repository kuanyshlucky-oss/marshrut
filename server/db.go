package main

import (
	"database/sql"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // драйвер Postgres (pgx) для database/sql
)

// User — то, что отдаётся фронтенду (без пароля).
type User struct {
	Name      string   `json:"name"`
	Email     string   `json:"email"`
	Profile   Profile  `json:"profile"`
	Favorites []string `json:"favorites"`
	Results   []Result `json:"results"`
	Access    []string `json:"access"` // коды направлений, к которым выдан доступ (см. access.go)
}

type Profile struct {
	FullName  string `json:"fullName"`
	Phone     string `json:"phone"`
	Education string `json:"education"`
	City      string `json:"city"`
	// МагистрТрек: цель поступления и баллы КТ
	SpecialityID int    `json:"specialityId"`
	Language     string `json:"language"`   // rus / kaz / eng
	TargetType   string `json:"targetType"` // grant / paid / any
	ForeignScore int    `json:"foreignScore"`
	ProfileScore int    `json:"profileScore"`
	BonusPoints  int    `json:"bonusPoints"`
}

type Result struct {
	Code  string `json:"code"`
	Score int    `json:"score"`
	Total int    `json:"total"`
	Date  string `json:"date"`
}

var db *sql.DB

func initDB(dsn string) error {
	var err error
	db, err = sql.Open("pgx", dsn)
	if err != nil {
		return err
	}
	// Neon free ограничивает число соединений — держим небольшой пул
	db.SetMaxOpenConns(5)
	db.SetConnMaxIdleTime(30 * time.Second)
	if err := db.Ping(); err != nil {
		return err
	}
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id            BIGSERIAL PRIMARY KEY,
		name          TEXT NOT NULL,
		email         TEXT NOT NULL UNIQUE,
		password_hash TEXT NOT NULL,
		full_name     TEXT NOT NULL DEFAULT '',
		phone         TEXT NOT NULL DEFAULT '',
		education     TEXT NOT NULL DEFAULT '',
		city          TEXT NOT NULL DEFAULT '',
		created_at    TEXT NOT NULL
	);
	CREATE TABLE IF NOT EXISTS favorites (
		user_id BIGINT NOT NULL,
		code    TEXT NOT NULL,
		UNIQUE(user_id, code)
	);
	CREATE TABLE IF NOT EXISTS results (
		id      BIGSERIAL PRIMARY KEY,
		user_id BIGINT NOT NULL,
		code    TEXT NOT NULL,
		score   INTEGER NOT NULL,
		total   INTEGER NOT NULL,
		date    TEXT NOT NULL
	);`
	_, err = db.Exec(schema)
	return err
}

func emailExists(email string) (bool, error) {
	var n int
	err := db.QueryRow(`SELECT COUNT(1) FROM users WHERE email = $1`, email).Scan(&n)
	return n > 0, err
}

func createUser(name, email, passwordHash string) (int64, error) {
	var id int64
	err := db.QueryRow(
		`INSERT INTO users(name, email, password_hash, full_name, created_at)
		 VALUES($1, $2, $3, $4, $5) RETURNING id`,
		name, email, passwordHash, name, time.Now().UTC().Format(time.RFC3339),
	).Scan(&id)
	return id, err
}

// getUserAuth возвращает id и хэш пароля по email (для входа).
func getUserAuth(email string) (int64, string, error) {
	var id int64
	var hash string
	err := db.QueryRow(`SELECT id, password_hash FROM users WHERE email = $1`, email).Scan(&id, &hash)
	return id, hash, err
}

// loadUser собирает полного пользователя: профиль + избранное + результаты.
func loadUser(id int64) (*User, error) {
	u := &User{Favorites: []string{}, Results: []Result{}, Access: []string{}}
	err := db.QueryRow(
		`SELECT name, email, full_name, phone, education, city,
		        speciality_id, language, target_type, foreign_score, profile_score, bonus_points
		 FROM users WHERE id = $1`, id,
	).Scan(&u.Name, &u.Email, &u.Profile.FullName, &u.Profile.Phone, &u.Profile.Education, &u.Profile.City,
		&u.Profile.SpecialityID, &u.Profile.Language, &u.Profile.TargetType,
		&u.Profile.ForeignScore, &u.Profile.ProfileScore, &u.Profile.BonusPoints)
	if err != nil {
		return nil, err
	}

	favRows, err := db.Query(`SELECT code FROM favorites WHERE user_id = $1 ORDER BY code`, id)
	if err != nil {
		return nil, err
	}
	for favRows.Next() {
		var c string
		if err := favRows.Scan(&c); err != nil {
			favRows.Close()
			return nil, err
		}
		u.Favorites = append(u.Favorites, c)
	}
	favRows.Close()

	resRows, err := db.Query(`SELECT code, score, total, date FROM results WHERE user_id = $1 ORDER BY id`, id)
	if err != nil {
		return nil, err
	}
	for resRows.Next() {
		var r Result
		if err := resRows.Scan(&r.Code, &r.Score, &r.Total, &r.Date); err != nil {
			resRows.Close()
			return nil, err
		}
		u.Results = append(u.Results, r)
	}
	resRows.Close()

	accRows, err := db.Query(`SELECT code FROM test_access WHERE user_id = $1 ORDER BY code`, id)
	if err != nil {
		return nil, err
	}
	for accRows.Next() {
		var c string
		if err := accRows.Scan(&c); err != nil {
			accRows.Close()
			return nil, err
		}
		u.Access = append(u.Access, c)
	}
	accRows.Close()

	return u, nil
}

func updateProfile(id int64, p Profile) error {
	// name в шапке = ФИО (как во фронтенде); если ФИО пустое — name не трогаем
	_, err := db.Exec(
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

func toggleFavorite(id int64, code string) error {
	var n int
	if err := db.QueryRow(`SELECT COUNT(1) FROM favorites WHERE user_id = $1 AND code = $2`, id, code).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		_, err := db.Exec(`DELETE FROM favorites WHERE user_id = $1 AND code = $2`, id, code)
		return err
	}
	_, err := db.Exec(`INSERT INTO favorites(user_id, code) VALUES($1, $2) ON CONFLICT DO NOTHING`, id, code)
	return err
}

// AdminUser — безопасное представление пользователя для админ-списка (без пароля).
type AdminUser struct {
	ID        int64    `json:"id"`
	Name      string   `json:"name"`
	Email     string   `json:"email"`
	Phone     string   `json:"phone"`
	Education string   `json:"education"`
	City      string   `json:"city"`
	Favorites []string `json:"favorites"`
	Results   int      `json:"results"`
	CreatedAt string   `json:"created_at"`
	Access    []string `json:"access"`
}

// listUsers одним запросом (агрегаты вместо цикла N+1): избранное и выданный
// доступ к тестам — через string_agg, число результатов — коррелированный
// подзапрос со своим индексом.
func listUsers() ([]AdminUser, error) {
	rows, err := db.Query(`
		SELECT u.id, u.name, u.email, u.phone, u.education, u.city, u.created_at,
		       COALESCE((SELECT string_agg(f.code, ',' ORDER BY f.code) FROM favorites f WHERE f.user_id = u.id), ''),
		       (SELECT COUNT(*) FROM results r WHERE r.user_id = u.id),
		       COALESCE((SELECT string_agg(a.code, ',' ORDER BY a.code) FROM test_access a WHERE a.user_id = u.id), '')
		FROM users u
		ORDER BY u.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []AdminUser{}
	for rows.Next() {
		var u AdminUser
		var favCSV, accessCSV string
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Phone, &u.Education, &u.City, &u.CreatedAt, &favCSV, &u.Results, &accessCSV); err != nil {
			return nil, err
		}
		if favCSV == "" {
			u.Favorites = []string{}
		} else {
			u.Favorites = strings.Split(favCSV, ",")
		}
		if accessCSV == "" {
			u.Access = []string{}
		} else {
			u.Access = strings.Split(accessCSV, ",")
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// Одна активная сессия на аккаунт: session_id в users сверяется с sid токена в auth().
func getSessionID(uid int64) (string, error) {
	var sid string
	err := db.QueryRow(`SELECT session_id FROM users WHERE id = $1`, uid).Scan(&sid)
	return sid, err
}

func setSessionID(uid int64, sid string) error {
	_, err := db.Exec(`UPDATE users SET session_id = $1 WHERE id = $2`, sid, uid)
	return err
}

// clearSessionID обнуляет активную сессию — используется при logout,
// чтобы украденный/оставленный токен сразу переставал работать.
// Пишем sentinelLoggedOut, а не пустую строку: пустая строка в auth() трактуется
// как «легаси-токен, пропустить» — так мы бы случайно снова открыли доступ.
func clearSessionID(uid int64) error {
	_, err := db.Exec(`UPDATE users SET session_id = $1 WHERE id = $2`, sentinelLoggedOut, uid)
	return err
}

func setPasswordHash(uid int64, hash string) error {
	_, err := db.Exec(`UPDATE users SET password_hash = $1 WHERE id = $2`, hash, uid)
	return err
}

func deleteUser(id int64) error {
	if _, err := db.Exec(`DELETE FROM favorites WHERE user_id = $1`, id); err != nil {
		return err
	}
	if _, err := db.Exec(`DELETE FROM results WHERE user_id = $1`, id); err != nil {
		return err
	}
	_, err := db.Exec(`DELETE FROM users WHERE id = $1`, id)
	return err
}

func addResult(id int64, code string, score, total int) error {
	_, err := db.Exec(
		`INSERT INTO results(user_id, code, score, total, date) VALUES($1, $2, $3, $4, $5)`,
		id, code, score, total, time.Now().UTC().Format("2006-01-02"),
	)
	return err
}
