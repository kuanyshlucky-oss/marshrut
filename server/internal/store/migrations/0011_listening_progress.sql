-- Listening: сводка прогресса по клипам (читается по ключу, а не считается по всей истории)
-- и идемпотентность записи (повторная отправка того же прохождения не создаёт дубль).
CREATE TABLE IF NOT EXISTS listening_progress (
	user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	clip_id    TEXT        NOT NULL,
	best       INT         NOT NULL DEFAULT 0,
	last       INT         NOT NULL DEFAULT 0,
	tries      INT         NOT NULL DEFAULT 0,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, clip_id)
);

ALTER TABLE listening_attempts ADD COLUMN IF NOT EXISTS attempt_id TEXT;
-- один и тот же attempt_id у одного пользователя записывается один раз (NULL — старые клиенты без id — не в счёт)
CREATE UNIQUE INDEX IF NOT EXISTS listening_attempts_attempt_uidx ON listening_attempts (user_id, attempt_id) WHERE attempt_id IS NOT NULL;

-- уже записанные прохождения переносим в сводку
INSERT INTO listening_progress (user_id, clip_id, best, last, tries)
SELECT a.user_id, a.clip_id, MAX(a.score), 0, COUNT(*)
  FROM listening_attempts a
 GROUP BY a.user_id, a.clip_id
ON CONFLICT (user_id, clip_id) DO NOTHING;

UPDATE listening_progress p
   SET last = COALESCE((SELECT l.score FROM listening_attempts l
                         WHERE l.user_id = p.user_id AND l.clip_id = p.clip_id
                         ORDER BY l.created_at DESC, l.id DESC LIMIT 1), p.last);
