-- Выборки по пользователю (кабинет, админ-список) без индекса читали всю таблицу.
CREATE INDEX IF NOT EXISTS results_user_id_idx ON results(user_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_id_desc_idx ON admin_audit_log(id DESC);
