-- Какие вопросы банка пользователь уже решал (для «Прогресса подготовки»: «решали X из N»).
-- qkey — отпечаток вопроса (content.Question.FP): переживает перестановку банка при деплое.
CREATE TABLE IF NOT EXISTS seen_questions (
	user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	code    TEXT   NOT NULL,
	section TEXT   NOT NULL,
	topic   TEXT   NOT NULL,
	qkey    TEXT   NOT NULL,
	PRIMARY KEY (user_id, code, section, qkey)
);
CREATE INDEX IF NOT EXISTS seen_questions_topic_idx ON seen_questions (user_id, code, section, topic);
