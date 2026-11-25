-- 004: сетка территории — светофор по районам там, где участков в базе нет.
-- Источник: data/grid-cells.json. Ячейки строятся скриптом/кнопкой «Построить сетку» в админке, id стабильны (G500-27-46).
-- Светофор по ячейке не хранится: считается из участков, зон, сетей и скважин (как паспорт участка), результат кэшируется.

CREATE TABLE grid_cells (
  id      text PRIMARY KEY,                           -- G{размер}-{ix}-{iy}, якорь — юго-западный угол области (72.9, 49.6)
  size_m  integer NOT NULL CHECK (size_m IN (250, 500, 1000, 2000)),
  ix      integer NOT NULL,
  iy      integer NOT NULL,
  geom    geometry(Polygon, 4326) NOT NULL,
  source  text NOT NULL DEFAULT 'auto',
  UNIQUE (size_m, ix, iy)
);
CREATE INDEX grid_cells_geom_gix ON grid_cells USING gist (geom);
