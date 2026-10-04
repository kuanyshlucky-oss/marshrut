-- Состояние защиты входа (неудачные попытки и блокировки) живёт в БД, а не в
-- памяти процесса: переживает рестарт и одинаково работает на нескольких
-- инстансах. UNLOGGED — без WAL, быстрее; после аварийного падения БД таблица
-- очищается, что для счётчиков попыток допустимо.
CREATE UNLOGGED TABLE IF NOT EXISTS login_attempts (
	key          TEXT PRIMARY KEY,
	fails        INT NOT NULL DEFAULT 0,
	window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
	locked_until TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS login_attempts_window_idx ON login_attempts(window_start);
