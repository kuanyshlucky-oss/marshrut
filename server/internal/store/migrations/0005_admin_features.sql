-- Админка: заметки, блокировка, последний вход, срок доступа, баннер, пометки вопросов.
ALTER TABLE users ADD COLUMN IF NOT EXISTS note          TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TEXT NOT NULL DEFAULT '';  -- RFC3339

-- пусто = бессрочно, иначе YYYY-MM-DD (включительно)
ALTER TABLE test_access ADD COLUMN IF NOT EXISTS expires_at TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS site_banner (
	id         INT PRIMARY KEY,
	text       TEXT NOT NULL DEFAULT '',
	kind       TEXT NOT NULL DEFAULT 'info',
	active     BOOLEAN NOT NULL DEFAULT false,
	updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS question_flags (
	id         BIGSERIAL PRIMARY KEY,
	bank       TEXT NOT NULL,
	idx        INT NOT NULL,
	question   TEXT NOT NULL DEFAULT '',
	note       TEXT NOT NULL DEFAULT '',
	resolved   BOOLEAN NOT NULL DEFAULT false,
	created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS question_flags_open_uq ON question_flags(bank, idx) WHERE NOT resolved;
