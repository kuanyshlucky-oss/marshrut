-- 002: слои карты — участки, ограничения, сети, покрытие данными.
-- Источники: parcels.json, constraints.json, utilities.json, coverage.json (в JSON полигон хранится как ring [[lng,lat],…]).

CREATE TABLE parcels (
  id          text PRIMARY KEY,
  cad         text NOT NULL DEFAULT '',                -- кадастровый номер
  geom        geometry(Polygon, 4326) NOT NULL,
  area_ha     numeric(10,4),
  status      text NOT NULL CHECK (status IN ('free','occupied','reserve','torgi')),
  purposes    text[] NOT NULL DEFAULT '{}',            -- разрешённые назначения
  zone        text NOT NULL DEFAULT '' CHECK (zone IN ('','residential','industrial','reserve','public')),
  max_floors  smallint,
  slope_pct   numeric(5,1),
  encumbrance text NOT NULL DEFAULT '',
  apz         boolean NOT NULL DEFAULT false,          -- есть архитектурно-планировочное задание
  tu          boolean NOT NULL DEFAULT false,          -- есть технические условия
  source      text NOT NULL DEFAULT '',
  props       jsonb NOT NULL DEFAULT '{}'              -- прочие поля из импорта
);
CREATE INDEX parcels_geom_gix ON parcels USING gist (geom);

CREATE TABLE constraints (
  id      text PRIMARY KEY,
  kind    text NOT NULL CHECK (kind IN ('protection','undermined','flood','sanitary')),
  name    text NOT NULL DEFAULT '',
  regime  text NOT NULL DEFAULT '',                    -- режим использования
  geom    geometry(Polygon, 4326) NOT NULL,
  source  text NOT NULL DEFAULT '',
  props   jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX constraints_geom_gix ON constraints USING gist (geom);

CREATE TABLE utilities (
  id            text PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('water','sewer','power')),
  geom          geometry(LineString, 4326) NOT NULL,
  capacity_free numeric(10,1),                         -- свободная мощность
  owner         text NOT NULL DEFAULT '',
  source        text NOT NULL DEFAULT '',
  props         jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX utilities_geom_gix ON utilities USING gist (geom);

-- Где данные актуальны: вне покрытия блок паспорта серый («нет данных»), а не зелёный.
CREATE TABLE coverage (
  id      text PRIMARY KEY,
  layer   text NOT NULL CHECK (layer IN ('hazards','protection','utilities')),
  as_of   date,
  geom    geometry(Polygon, 4326) NOT NULL,
  source  text NOT NULL DEFAULT ''
);
CREATE INDEX coverage_geom_gix ON coverage USING gist (geom);
CREATE INDEX coverage_layer_idx ON coverage (layer);
