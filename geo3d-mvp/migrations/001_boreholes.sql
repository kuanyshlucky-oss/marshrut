-- 001: расширение PostGIS, скважины и их слои.
-- Источник: data/boreholes.json (формат «v2»). Выводимые поля b[] и gw в базе не хранятся — считаются из layers.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE boreholes (
  id           text PRIMARY KEY,                       -- «DEMO-01», номер из журнала
  report_id    text NOT NULL DEFAULT '',               -- номер отчёта об изысканиях
  geom         geometry(Point, 4326) NOT NULL,         -- lng/lat
  crs_src      text NOT NULL DEFAULT '',               -- исходная система координат («WGS84», «МСК-…»)
  acc          char(1) NOT NULL DEFAULT 'D' CHECK (acc IN ('A','B','C','D')),   -- класс точности координат
  z            numeric(8,2),                           -- абсолютная отметка устья, м
  z_src        text NOT NULL DEFAULT '',               -- откуда отметка (нивелир, GNSS, демо…)
  drilled_on   date,                                   -- дата бурения (поле date в JSON)
  depth        numeric(6,2),                           -- глубина скважины, м
  method       text NOT NULL DEFAULT '',
  org          text NOT NULL DEFAULT '',
  doc          text NOT NULL DEFAULT '',
  gw_first     numeric(6,2),                           -- первое появление воды, м
  gw_stable    numeric(6,2),                           -- установившийся уровень, м
  gw_date      date,
  bearing_kpa  numeric(8,1),                           -- несущая способность, кПа
  aggressive   text NOT NULL DEFAULT '',               -- агрессивность среды
  status       text NOT NULL DEFAULT 'review' CHECK (status IN ('review','verified','rejected')),
  verified     boolean NOT NULL DEFAULT false,
  issues       jsonb NOT NULL DEFAULT '[]',            -- результаты автопроверок
  incons       jsonb NOT NULL DEFAULT '[]',            -- _incons: найденные несоответствия
  review       jsonb,                                  -- кто и когда проверил {by, at, note}
  source       text NOT NULL DEFAULT '',               -- demo / import / manual
  loaded_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX boreholes_geom_gix   ON boreholes USING gist (geom);
CREATE INDEX boreholes_status_idx ON boreholes (status);
CREATE INDEX boreholes_source_idx ON boreholes (source);

CREATE TABLE borehole_layers (
  borehole_id  text NOT NULL REFERENCES boreholes(id) ON DELETE CASCADE,
  layer_no     smallint NOT NULL,                      -- порядок сверху вниз, с 1
  from_m       numeric(6,2) NOT NULL,
  to_m         numeric(6,2) NOT NULL,
  soil         text NOT NULL,                          -- название как в журнале
  cls          smallint,                               -- класс грунта 0–4 (по словарю)
  cls_src      text NOT NULL DEFAULT '',               -- file / dict / manual
  ige          text,                                   -- номер ИГЭ
  PRIMARY KEY (borehole_id, layer_no),
  CHECK (to_m >= from_m)
);
