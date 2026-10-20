-- Прогресс практики английского (practice.html): лучший результат и число попыток по юнитам.
CREATE TABLE IF NOT EXISTS practice_progress (
	user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	unit_id TEXT   NOT NULL,
	best    INT    NOT NULL DEFAULT 0,
	last    INT    NOT NULL DEFAULT 0,
	tries   INT    NOT NULL DEFAULT 0,
	PRIMARY KEY (user_id, unit_id)
);
