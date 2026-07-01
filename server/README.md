# Маршрут — API (Go + SQLite)

REST-бэкенд для платформы «Маршрут». Заменяет localStorage-«бэкенд»
фронтенда на настоящий сервер: аккаунты, профиль, избранные направления,
результаты тестов.

## Стек
- **Go** (стандартный `net/http`, роутинг Go 1.22)
- **SQLite** через `modernc.org/sqlite` (чистый Go, без cgo)
- Пароли — **bcrypt**; авторизация — самоподписанный **HMAC-токен** в заголовке `Authorization: Bearer <token>`
- **Docker** для деплоя на Render/Railway

## Эндпоинты
| Метод | Путь | Авторизация | Назначение |
|------|------|:---:|------|
| GET  | `/api/health` | — | проверка живости |
| POST | `/api/auth/register` | — | регистрация → `{token, user}` |
| POST | `/api/auth/login` | — | вход → `{token, user}` |
| GET  | `/api/me` | ✅ | текущий пользователь |
| PUT  | `/api/profile` | ✅ | сохранить профиль (ФИО, телефон, образование, город) |
| POST | `/api/favorites/toggle` | ✅ | добавить/убрать направление в избранном `{code}` |
| POST | `/api/results` | ✅ | сохранить результат теста `{code, score, total}` |

## Переменные окружения
См. `.env.example`. Ключевые:
- `PORT` — порт (по умолчанию 8080)
- `DB_PATH` — путь к файлу SQLite
- `JWT_SECRET` — **обязательно** свой длинный случайный на проде
- `ALLOWED_ORIGIN` — домен фронта для CORS (адрес GitHub Pages)

## Локальный запуск
Нужен установленный Go (1.22+).
```bash
cd server
go mod tidy      # один раз: подтянет зависимости и создаст go.sum
go run .
# сервер на http://localhost:8080
curl http://localhost:8080/api/health
```

## Деплой на Render (через Docker)
1. Запушить репозиторий на GitHub (папка `server/` уже в нём).
2. Render → **New → Web Service** → подключить репозиторий `marshrut`.
3. **Root Directory**: `server`  •  **Runtime**: Docker (определится по `Dockerfile`).
4. Переменные окружения:
   - `JWT_SECRET` — длинная случайная строка,
   - `ALLOWED_ORIGIN` — `https://kuanyshlucky-oss.github.io`.
5. Create Web Service → дождаться сборки → получите адрес вида
   `https://marshrut-api.onrender.com`.
6. Проверка: открыть `https://<адрес>/api/health` → `{"status":"ok"}`.

### ⚠️ Про сохранность данных
На **бесплатном** плане Render файловая система эфемерна — SQLite **сбрасывается
при каждом редеплое/перезапуске**. Для постоянного хранения:
- **Render**: добавить платный Disk, примонтировать на `/app/data` (см. `render.yaml`);
- **Railway**: примонтировать Volume на `/app/data` (проще и дешевле);
- либо позже переехать на **PostgreSQL** (Neon/Supabase — бесплатные тиры).

Для разработки/демо эфемерная БД подходит.

## Дальше
Подключить фронтенд: заменить в `script.js` объект `API` (localStorage)
на `fetch()`-запросы к этому серверу, хранить `token` в localStorage.
