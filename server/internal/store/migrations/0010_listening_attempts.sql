-- Результаты прохождения диктантов Listening (listening.html): одна строка = одно прохождение клипа.
-- Лучший результат, последний и число попыток считаются запросом; по строкам видна история и результат по каждой фразе.
CREATE TABLE IF NOT EXISTS listening_attempts (
	id         BIGSERIAL PRIMARY KEY,
	user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	clip_id    TEXT        NOT NULL,
	score      INT         NOT NULL CHECK (score BETWEEN 0 AND 100),
	phrases    JSONB       NOT NULL DEFAULT '[]'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listening_attempts_user_clip_idx ON listening_attempts (user_id, clip_id, created_at DESC);
