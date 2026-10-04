-- Попытки тестов: вариант собирает сервер и хранит ссылки на вопросы (без ключей
-- ответов), при сдаче проверяет ответы и записывает результат. Так балл и
-- вердикт «сдал/не сдал» нельзя подделать, а ключи не уходят клиенту до сдачи.
CREATE TABLE IF NOT EXISTS attempts (
	id           TEXT PRIMARY KEY,
	user_id      BIGINT NOT NULL,
	kind         TEXT NOT NULL,                -- subject | kt:nauchped | kt:profile
	code         TEXT NOT NULL,
	section      TEXT NOT NULL DEFAULT '',     -- предмет (только kind = subject)
	lang         TEXT NOT NULL DEFAULT '',     -- иностранный язык КТ
	content_lang TEXT NOT NULL DEFAULT 'ru',   -- язык профильного контента
	title        TEXT NOT NULL DEFAULT '',
	items        JSONB NOT NULL,               -- ссылки на вопросы: банк, индекс, блок, отпечаток
	answers      JSONB,                        -- ответы; появляются при сдаче
	created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
	expires_at   TIMESTAMPTZ NOT NULL,
	submitted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS attempts_user_created_idx ON attempts(user_id, created_at DESC);

-- Связь результата с попыткой (разбор ответов в кабинете); у старых результатов пусто.
ALTER TABLE results ADD COLUMN IF NOT EXISTS attempt_id TEXT NOT NULL DEFAULT '';
