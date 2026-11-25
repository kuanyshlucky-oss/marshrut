-- 003: заказы, заявки, события аналитики, словарь грунтов, журнал изменений.

CREATE TABLE orders (
  id          text PRIMARY KEY,
  token_hash  text NOT NULL UNIQUE,                    -- sha256 токена отчёта; сам токен в базе не хранится
  geom        geometry(Point, 4326) NOT NULL,
  email       text NOT NULL DEFAULT '',
  price       integer NOT NULL DEFAULT 0,              -- ₸
  free        boolean NOT NULL DEFAULT false,          -- выдан бесплатно (пробный период)
  obj         text CHECK (obj IN ('izhs','multi')),    -- тип объекта; у старых заказов пусто
  status      text NOT NULL CHECK (status IN ('pending','paid')),
  created_at  timestamptz NOT NULL,
  paid_at     timestamptz,
  demo        boolean NOT NULL DEFAULT false
);
CREATE INDEX orders_status_idx  ON orders (status);
CREATE INDEX orders_created_idx ON orders (created_at);

CREATE TABLE leads (                                   -- заявки на изыскания
  id          text PRIMARY KEY,
  created_at  timestamptz NOT NULL,
  name        text NOT NULL,
  phone       text NOT NULL,
  comment     text NOT NULL DEFAULT '',
  geom        geometry(Point, 4326),                   -- может быть пустой
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new','work','done')),
  demo        boolean NOT NULL DEFAULT false
);
CREATE INDEX leads_status_idx ON leads (status);

CREATE TABLE events (                                  -- журнал событий (events.jsonl), хранится 180 дней
  id       bigserial PRIMARY KEY,
  ts       timestamptz NOT NULL,                       -- поле t в JSON (мс с 1970)
  type     text NOT NULL,
  sid      text NOT NULL,                              -- анонимная сессия
  demo     boolean NOT NULL DEFAULT false,
  payload  jsonb NOT NULL DEFAULT '{}'                 -- lng, lat, orderId, price, avail, dmin…
);
CREATE INDEX events_ts_idx   ON events (ts);
CREATE INDEX events_type_idx ON events (type, ts);

CREATE TABLE soil_dictionary (                         -- шаблон названия грунта → класс 0–4
  pattern  text PRIMARY KEY,
  cls      smallint NOT NULL CHECK (cls BETWEEN 0 AND 4)
);

CREATE TABLE audit_log (                               -- кто и что менял в админке
  id        bigserial PRIMARY KEY,
  ts        timestamptz NOT NULL DEFAULT now(),
  actor     text NOT NULL,
  action    text NOT NULL,                             -- review, import, delete, soil_dict…
  entity    text NOT NULL,
  entity_id text,
  details   jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_log_ts_idx ON audit_log (ts);
