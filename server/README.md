# JetisHub — API (Go + SQLite)

REST-бэкенд для платформы «JetisHub». Заменяет localStorage-«бэкенд»
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

## WhatsApp (Cloud API, напрямую через Meta)

Приём сообщений от студентов в поддержку + возможность ответить из админки.
Реализация — `whatsapp.go`. Использует официальный **WhatsApp Cloud API**
(бесплатный, без посредников), а не WhatsApp Business App.

### Эндпоинты
| Метод | Путь | Авторизация | Назначение |
|------|------|:---:|------|
| GET  | `/api/whatsapp/webhook` | verify_token в query | верификация вебхука при подключении в Meta |
| POST | `/api/whatsapp/webhook` | подпись X-Hub-Signature-256 | приём входящих сообщений от Meta |
| GET  | `/api/admin/whatsapp/messages` | ✅ admin | последние 200 сообщений (переписка) |
| POST | `/api/admin/whatsapp/send` | ✅ admin | отправить ответ `{to, text}` |

### Настройка на стороне Meta (нужно сделать самостоятельно)

Номер телефона, который сейчас в обычном приложении **WhatsApp Business**,
нужно зарегистрировать в Cloud API — это отдельный процесс миграции, номер
после этого работает через API, а не через приложение на телефоне.

1. **Meta for Developers** (developers.facebook.com) → создать приложение
   типа **Business**, добавить продукт **WhatsApp**.
2. В **Meta Business Manager** привязать/создать бизнес-аккаунт (Business
   Account) — если ещё не проходили верификацию бизнеса, часть функций
   (например, отправка первым, не в ответ) будет ограничена до её прохождения.
3. В App Dashboard → **WhatsApp → API Setup**:
   - **Add phone number** → пройти миграцию номера, который уже используется
     в WhatsApp Business App (потребуется код подтверждения по SMS/звонку;
     старое приложение на телефоне после этого перестанет получать сообщения
     этого номера — вся переписка идёт через API).
   - Скопировать **Phone Number ID** → `WA_PHONE_NUMBER_ID`.
   - Создать **System User** в Business Settings → сгенерировать постоянный
     токен с правами `whatsapp_business_messaging` → `WA_ACCESS_TOKEN`
     (временный токен из API Setup живёт 24 часа — подходит только для теста).
4. В **App Settings → Basic** скопировать **App Secret** → `WA_APP_SECRET`.
5. Придумать любую случайную строку → `WA_VERIFY_TOKEN` (записать и в `.env`,
   и потом ввести то же самое значение в настройках вебхука в Meta).
6. Задеплоить сервер (адрес должен быть доступен по HTTPS — Render это даёт
   из коробки), затем в App Dashboard → **WhatsApp → Configuration → Webhook**:
   - Callback URL: `https://<ваш-домен>/api/whatsapp/webhook`
   - Verify token: то же значение, что в `WA_VERIFY_TOKEN`
   - Подписаться на поле **messages**.

### Ограничения, о которых стоит знать
- Отвечать текстом свободно можно только в течение **24 часов** после
  последнего входящего сообщения от пользователя (это правило самого
  WhatsApp, не наше). Чтобы написать первым за пределами этого окна, нужен
  заранее одобренный **шаблон сообщения** (Message Templates) — здесь не
  реализовано.
- Пока бизнес не прошёл верификацию в Meta, действует лимит на число
  уникальных получателей в сутки (обычно 250) — для теста и небольшой
  поддержки этого достаточно.

## Дальше
Подключить фронтенд: заменить в `script.js` объект `API` (localStorage)
на `fetch()`-запросы к этому серверу, хранить `token` в localStorage.
