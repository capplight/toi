# Той

Веб-приложение для подготовки казахского тоя: список гостей у нескольких составителей, приглашения с ответом, рассадка по столам, помощник на входе, расходы. Языки — казахский (по умолчанию) и русский.

Стек: Next.js (App Router) · React 19 · TypeScript strict · Tailwind CSS v4 · next-intl · Drizzle + PostgreSQL (Neon на пилоте) · Vitest · Playwright. Подробности и причины — `architecture/ARCHITECTURE_PLAN.md`, раздел 2.

## Запуск локально

Нужны Node ≥ 22 (на машине основателя Node 24) и pnpm.

```bash
corepack enable pnpm          # если нет прав на C:\Program Files: corepack enable pnpm --install-directory "%APPDATA%\npm"
pnpm install
cp .env.example .env.local    # заполнить значения; файл не коммитится
pnpm db:migrate               # на ветку Neon `dev` (DATABASE_URL_UNPOOLED)
pnpm dev                      # http://localhost:3000
```

Без Docker и без Neon можно поднять локальную базу на PGlite: `pnpm db:local` (порт 5433, данные в `.pglite/`; `--memory` — без сохранения), затем в `.env.local` `DATABASE_DRIVER=pg` и `DATABASE_URL`/`DATABASE_URL_UNPOOLED=postgres://postgres:postgres@127.0.0.1:5433/postgres?sslmode=disable`, `pnpm db:migrate`, `pnpm db:seed --links` (демо-той «Айбек пен Дана» и ссылки входа для Әкесі/Анасы/Жастар).

Основная локальная база — ветка **Neon `dev`** (строки pooled → `DATABASE_URL`, direct → `DATABASE_URL_UNPOOLED`, `DATABASE_DRIVER=neon`). Docker не обязателен; `docker-compose.yml` (Postgres 16 + MinIO) лежит для тех, у кого он есть (`DATABASE_DRIVER=pg`).

Без обязательной переменной сервер не стартует и называет, какой переменной нет. SMS локально — `SMS_PROVIDER=console` (сообщение печатается в лог).

## Команды

| Команда | Что делает |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | разработка / сборка (`standalone`) / запуск сборки |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| `pnpm lint` / `pnpm format` | ESLint (с правилом границ `src/domain`) / Prettier |
| `pnpm test` / `pnpm test:coverage` | unit-тесты Vitest |
| `pnpm test:integration` | integration-тесты на базе: PGlite в памяти или `TEST_DATABASE_URL` (CI: postgres:16) |
| `pnpm test:e2e` | Playwright smoke (`mobile` 360×740, `desktop` 1440×900) против `next start`; сначала `pnpm build`. Проверка `db: "ok"` пропускается без `DATABASE_URL` |
| `pnpm check:messages` | проверка `content/messages` (ключи, ICU, переменные, теги, `select`/`other`, ru `plural`) |
| `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio` | миграции Drizzle в `db/migrations` |
| `pnpm db:local` / `pnpm db:seed [--links]` / `pnpm db:seed-empty` | локальная база PGlite; сиды из `tests/fixtures/sample-event.ts` (только local/preview) |
| `pnpm admin:owner-link +7701…` | ссылка входа хозяина пилота (поток 4, только основатель, нужен env прода) |
| `pnpm start:standalone` | запуск standalone-сборки (как в Docker; e2e работают против неё) |
| `pnpm sms:test --provider smsc\|mobizon --to +7701… [--lang kk\|ru] [--operator Kcell]` | тестовая SMS на номер из `SMS_TEST_ALLOWLIST` и отчёт о доставке |

## Где что лежит

- `src/app/` — маршруты; `src/domain/` — чистая логика без React и БД; `src/server/` — база, окружение, SMS, действия; `src/i18n/` — подключение `content/messages`; `src/ui/` — дизайн-система (Ф1).
- `content/messages/kk.json`, `ru.json` — **все** тексты интерфейса (источник правды).
- `db/migrations/` — SQL-миграции; `scripts/` — служебные скрипты; `tests/` — unit, integration, e2e, фикстуры.
- Документы: `architecture/ARCHITECTURE_PLAN.md` (план), `docs/DECISIONS.md` (решения), `docs/phases/` (брифы и сдачи фаз), `design/` (дизайн v2), `content/` (тексты и стайлгайд), `research/`, `prototype/` (только чтение), `HANDOVER_v2.md`.
- Правила для агентов — `AGENTS.md`.

## Деплой

Vercel, проект `toi-pilot`, регион функций `fra1` (`vercel.json`), домен `toi-pilot.vercel.app`. Preview на каждый PR со своей веткой Neon. CI — `.github/workflows/ci.yml`. Docker-образ (`Dockerfile`) собирается в CI как путь к хостингу в Казахстане.
