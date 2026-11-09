-- Журнал начала использования платного доступа.
-- Одна строка на (пользователь, тест, язык): когда впервые открыт вопрос платной части,
-- и сколько попыток начато с тех пор. Нужен для возвратов: после начала использования
-- возврат не предусмотрен (оферта, п. 7). Время хранится как RFC3339 UTC (как в остальных таблицах).
-- ON DELETE CASCADE: при удалении аккаунта журнал удаляется вместе с ним.
CREATE TABLE IF NOT EXISTS usage_first (
	user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	code       TEXT   NOT NULL,
	language   TEXT   NOT NULL,
	first_at   TEXT   NOT NULL,
	attempt_id TEXT   NOT NULL DEFAULT '',
	kind       TEXT   NOT NULL DEFAULT '',
	section    TEXT   NOT NULL DEFAULT '',
	ip         TEXT   NOT NULL DEFAULT '',
	attempts   INT    NOT NULL DEFAULT 1,
	last_at    TEXT   NOT NULL,
	PRIMARY KEY (user_id, code, language)
);
