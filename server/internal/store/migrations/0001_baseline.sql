-- 0001 baseline: схема, существовавшая до введения версионных миграций.
-- Полностью идемпотентна (IF NOT EXISTS): на действующей БД ничего не меняет.

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
	-- Блокировка аккаунта после серии неверных паролей (в дополнение к
	-- IP-based rate-limit на /api/auth/login — тот не спасает от подбора
	-- пароля к ОДНОМУ аккаунту с разных IP).
	ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until    TEXT NOT NULL DEFAULT '';
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
	);
	-- kind различает обычный тест по предмету от полной симуляции КТ (см. Result
	-- в этом файле); passed — официальный вердикт симуляции (сумма + минимумы
	-- по блокам), посчитанный один раз на клиенте в момент завершения попытки.
	ALTER TABLE results ADD COLUMN IF NOT EXISTS kind    TEXT NOT NULL DEFAULT '';
	ALTER TABLE results ADD COLUMN IF NOT EXISTS passed  BOOLEAN NOT NULL DEFAULT false;
	ALTER TABLE results ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT '';
	CREATE TABLE IF NOT EXISTS topic_stats (
		id      BIGSERIAL PRIMARY KEY,
		user_id BIGINT NOT NULL,
		code    TEXT NOT NULL,
		section TEXT NOT NULL,
		topic   TEXT NOT NULL,
		correct INTEGER NOT NULL DEFAULT 0,
		wrong   INTEGER NOT NULL DEFAULT 0,
		UNIQUE(user_id, code, section, topic)
	);

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
		profile_subject TEXT NOT NULL,
		kt_applications  INT NOT NULL DEFAULT 0,
		kt_participants  INT NOT NULL DEFAULT 0,
		kt_passed        INT NOT NULL DEFAULT 0,
		kt_passed_pct    DOUBLE PRECISION NOT NULL DEFAULT 0
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
		id             BIGSERIAL PRIMARY KEY,
		year           INT NOT NULL,
		step_order     INT NOT NULL,
		description    TEXT NOT NULL,
		description_kk TEXT NOT NULL DEFAULT '',
		deadline       DATE NOT NULL,
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
	-- казахский перевод шагов дорожной карты (обвязка интерфейса — в скоупе i18n,
	-- в отличие от контента направлений/тем, который остаётся русскоязычным)
	ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS description_kk TEXT NOT NULL DEFAULT '';
	-- расширение справочника специальностей (статистика КТ-2025 по группам)
	ALTER TABLE specialities ADD COLUMN IF NOT EXISTS kt_applications INT NOT NULL DEFAULT 0;
	ALTER TABLE specialities ADD COLUMN IF NOT EXISTS kt_participants INT NOT NULL DEFAULT 0;
	ALTER TABLE specialities ADD COLUMN IF NOT EXISTS kt_passed       INT NOT NULL DEFAULT 0;
	ALTER TABLE specialities ADD COLUMN IF NOT EXISTS kt_passed_pct   DOUBLE PRECISION NOT NULL DEFAULT 0;
	-- расширение профиля пользователя
	ALTER TABLE users ADD COLUMN IF NOT EXISTS speciality_id INT NOT NULL DEFAULT 0;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS language      TEXT NOT NULL DEFAULT '';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS target_type   TEXT NOT NULL DEFAULT '';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS foreign_score INT NOT NULL DEFAULT 0;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_score INT NOT NULL DEFAULT 0;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_points  INT NOT NULL DEFAULT 0;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS session_id    TEXT NOT NULL DEFAULT '';
	-- аватар — data URL (data:image/jpeg;base64,...), уменьшенный и сжатый на
	-- клиенте перед отправкой (см. handleSetAvatar про лимит размера)
	ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar        TEXT NOT NULL DEFAULT '';

	-- Доступ к тестам: выдаётся администратором на код направления и язык.
	CREATE TABLE IF NOT EXISTS test_access (
		user_id    BIGINT NOT NULL,
		code       TEXT NOT NULL,
		language   TEXT NOT NULL DEFAULT 'ru',
		granted_at TEXT NOT NULL,
		UNIQUE(user_id, code, language)
	);
	-- Миграция для БД, где таблица была создана до появления языка теста
	-- (раньше уникальность была по (user_id, code) без языка).
	ALTER TABLE test_access ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'ru';
	ALTER TABLE test_access DROP CONSTRAINT IF EXISTS test_access_user_id_code_key;
	-- Postgres сообщает "уже существует" для ограничения то как duplicate_object
	-- (42710), то как duplicate_table (42P07) — у UNIQUE есть одноимённый индекс.
	-- Ловим оба, иначе повторное применение падало бы.
	DO $$ BEGIN
		ALTER TABLE test_access ADD CONSTRAINT test_access_user_id_code_language_key UNIQUE(user_id, code, language);
	EXCEPTION
		WHEN duplicate_object THEN NULL;
		WHEN duplicate_table THEN NULL;
	END $$;

	-- Журнал админ-действий: ADMIN_KEY общий, поэтому единственный способ понять
	-- постфактум, кто и что сделал — писать след при каждом изменении.
	CREATE TABLE IF NOT EXISTS admin_audit_log (
		id         BIGSERIAL PRIMARY KEY,
		action     TEXT NOT NULL,
		target     TEXT NOT NULL DEFAULT '',
		detail     TEXT NOT NULL DEFAULT '',
		actor_ip   TEXT NOT NULL,
		created_at TEXT NOT NULL
	);
