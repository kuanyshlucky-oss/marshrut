# Миграция на PostgreSQL + PostGIS

Статус: **этап 1 готов** (слой `db.js`), **этап 2 готов** (схема, `migrations/*.sql`), этапы 3–7 впереди.

## Схема (migrations/)
| Файл | Таблицы |
|---|---|
| `001_boreholes.sql` | `boreholes` (точка `geometry(Point,4326)`, GiST-индекс), `borehole_layers` (слои сверху вниз, каскадное удаление) |
| `002_map_layers.sql` | `parcels` (Polygon), `constraints` (Polygon), `utilities` (LineString), `coverage` (Polygon) — все с GiST-индексом |
| `003_business.sql` | `orders` (токен только как sha256), `leads`, `events` (jsonb payload), `soil_dictionary`, `audit_log` |

## Как поля JSON легли в таблицы
- `lng, lat` → `geom`; `ring` → полигон (кольцо замкнуто уже в данных); `line` → LineString.
- `date` → `drilled_on`; `_incons` → `incons`; выводимые `b[]` и `gw` не хранятся, считаются из `borehole_layers`.
- Заказ: `token` → `token_hash = sha256(token)`, `created/paidAt` → `created_at/paid_at`.
- События: `t` (мс) → `ts timestamptz`; всё, кроме `t, type, sid, demo`, → `payload`.
- Нестандартные поля из импорта слоёв сохраняются в `props jsonb`.

## Применение (когда будет база)
```
psql "$DATABASE_URL" -f migrations/001_boreholes.sql
psql "$DATABASE_URL" -f migrations/002_map_layers.sql
psql "$DATABASE_URL" -f migrations/003_business.sql
```
Файлы выполняются по порядку и один раз. Раннер с таблицей `schema_migrations` появится на этапе 4.

## Не проверено
SQL написан без запуска: на этой машине нет PostgreSQL, проверена только структура (скобки, число таблиц). Первая реальная проверка — на этапе 3, при импорте на тестовой базе.

## Решения, которые стоит подтвердить
- Токен заказа в базе только хэшем: ссылки на отчёты у уже выданных заказов продолжат работать, потому что хэш считается из токена при импорте, но потерять токен в базе нельзя.
- `status` скважины ограничен `review/verified/rejected`, `status` участка — `free/occupied/reserve/torgi`; новый статус потребует миграции.

## Этап 3: импорт (tools/import-json-to-pg.js)
```
node tools/import-json-to-pg.js --dry              # проверка источника, без базы
node tools/import-json-to-pg.js --migrate --apply  # схема + данные одной транзакцией + сверка
```
- Всё в одной транзакции: если сверка (число записей по таблицам, суммарная мощность слоёв) не сходится, откат.
- Повторный запуск обновляет записи по `id`; журнал событий заменяется целиком.
- Токены заказов превращаются в sha256 при импорте.
- Словарь грунтов импортируется, только если есть `data/soil-dictionary.json`; иначе сервер использует встроенный словарь.
- Нужен пакет `pg`: `npm install` в папке `geo3d-mvp`.

### Supabase
1. supabase.com → New project (регион поближе, например Frankfurt), запомнить пароль базы.
2. SQL Editor: `create extension if not exists postgis;` (миграция 001 сделает это сама, но так видно сразу, разрешено ли).
3. Project Settings → Database → Connection string → URI (Session pooler). Подставить пароль, записать в `.env` как `DATABASE_URL=...`. В чат и в git его не отправлять.
4. Данные клиентов из Казахстана: проверьте требования к месту хранения персональных данных (телефоны в заявках).
