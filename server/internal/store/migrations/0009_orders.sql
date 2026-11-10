-- Оплата: заказы, журнал платёжных событий (идемпотентность и аудит), ссылки для установки пароля, очередь писем.

-- Заказ на доступ. Согласия покупателя (оферта и немедленное предоставление) хранятся вместе с версией оферты,
-- временем и IP: это доказательство акцепта (оферта, п. 2.2).
-- Статусы: pending → claimed («я оплатил», ждёт проверки) → paid → refunded; failed — платёж не прошёл.
CREATE TABLE IF NOT EXISTS orders (
	id                TEXT    PRIMARY KEY,
	email             TEXT    NOT NULL,
	name              TEXT    NOT NULL DEFAULT '',
	product           TEXT    NOT NULL,
	code              TEXT    NOT NULL,
	language          TEXT    NOT NULL,
	days              INT     NOT NULL,
	amount            BIGINT  NOT NULL,
	currency          TEXT    NOT NULL DEFAULT 'KZT',
	status            TEXT    NOT NULL DEFAULT 'pending',
	provider          TEXT    NOT NULL,
	provider_ref      TEXT    NOT NULL DEFAULT '',
	offer_version     TEXT    NOT NULL,
	accepted_at       TEXT    NOT NULL,
	accepted_ip       TEXT    NOT NULL DEFAULT '',
	immediate_consent BOOLEAN NOT NULL,
	payer_hint        TEXT    NOT NULL DEFAULT '',
	claimed_at        TEXT    NOT NULL DEFAULT '',
	user_id           BIGINT  REFERENCES users(id) ON DELETE SET NULL,
	created_at        TEXT    NOT NULL,
	paid_at           TEXT    NOT NULL DEFAULT '',
	refunded_at       TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status, created_at);
CREATE INDEX IF NOT EXISTS orders_email_idx  ON orders (email);
CREATE UNIQUE INDEX IF NOT EXISTS orders_provider_ref_uq ON orders (provider, provider_ref) WHERE provider_ref <> '';

-- Каждое платёжное событие обрабатывается один раз: повторная доставка уведомления упрётся в UNIQUE.
CREATE TABLE IF NOT EXISTS payment_events (
	id          BIGSERIAL PRIMARY KEY,
	provider    TEXT NOT NULL,
	event_id    TEXT NOT NULL,
	order_id    TEXT NOT NULL DEFAULT '',
	kind        TEXT NOT NULL,
	note        TEXT NOT NULL DEFAULT '',
	payload     TEXT NOT NULL DEFAULT '',
	received_at TEXT NOT NULL,
	UNIQUE (provider, event_id)
);

-- Одноразовые ссылки «задайте пароль». В БД хранится только SHA-256 токена.
CREATE TABLE IF NOT EXISTS password_setups (
	token_hash TEXT   PRIMARY KEY,
	user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at TEXT   NOT NULL,
	used_at    TEXT   NOT NULL DEFAULT '',
	created_at TEXT   NOT NULL
);

-- Очередь писем: выдача доступа не зависит от доступности почтового сервера.
CREATE TABLE IF NOT EXISTS email_outbox (
	id         BIGSERIAL PRIMARY KEY,
	to_email   TEXT NOT NULL,
	subject    TEXT NOT NULL,
	body       TEXT NOT NULL,
	kind       TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	sent_at    TEXT NOT NULL DEFAULT '',
	attempts   INT  NOT NULL DEFAULT 0,
	last_error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS email_outbox_pending_idx ON email_outbox (id) WHERE sent_at = '';
