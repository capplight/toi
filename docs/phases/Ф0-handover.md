# Ф0 · Старт и проверки — пакет сдачи

Версия 1.0 · 2026-10-09 · full-stack разработчик (агент) → архитектор
Бриф: `docs/phases/Ф0-brief.md` v1.0. План: `architecture/ARCHITECTURE_PLAN.md` v1.3, 13.5.

**Статус:** локальная часть (раздел 3 брифа) сделана целиком и проверена на этой машине. Всё, что требует аккаунтов (GitHub, Vercel, Neon, R2, SMSC.kz, Mobizon, Sentry), подготовлено и **ожидает основателя** (раздел 10).

---

## 1. Ссылки

| Что | Где |
|---|---|
| Репозиторий | локальный git в `D:\My Project\toi\` (решение А1). Remote нет — **ожидает основателя** (GitHub) |
| Ветки | `main` — коммит `e1b3fd3` (только `.gitignore`, `.gitattributes` и документы); `phase/F0-setup` — коммиты `10aec5f`, `d7d0449` |
| PR | ожидает основателя (нужен GitHub) |
| Preview URL | ожидает основателя (нужен Vercel) |
| Прод | ожидает основателя: `https://toi-pilot.vercel.app` |
| `/api/health` preview / прод | ожидает основателя. Локально (без базы): `{"ok":false,"commit":"dev","db":"error","time":"…"}`, HTTP 503 — допустимо по брифу 4.3. С Postgres-совместимой базой — `db: "ok"` (раздел 5.6) |
| Демо-логин | в Ф0 нет (вход — Ф2) |

## 2. Что сделано (чек-лист брифа, раздел 3)

### 3.1 Git и каркас
- [x] `git init` в `D:\My Project\toi\`, ветка `main`. Первый коммит — `.gitignore` (+ `.gitattributes`) и существующие документы. Каркас — в ветке `phase/F0-setup`.
- [x] `.gitignore`: всё из брифа (`node_modules/`, `.next/`, `out/`, `coverage/`, `playwright-report/`, `test-results/`, `.vercel/`, `.env*` + `!.env.example`, `*.log`, `.DS_Store`, `design/v2/covers/source/`) + `next-env.d.ts`, `*.tsbuildinfo`, `blob-report/`.
- [x] Каркас Next.js сгенерирован `create-next-app@16.4.0` во временной папке **вне репозитория** (scratchpad), в репозиторий перенесены и доработаны только нужные файлы. TS strict + `noUncheckedIndexedAccess`, алиас `@/*` → `src/*`, Tailwind v4, маршруты в `src/app/`, `next.config.ts` с `output: "standalone"`.
- [x] Скелет папок 11.1: `src/domain/{seating,guests,invitations}`, `src/server/{auth,actions,sms,storage}`, `src/ui`, `src/i18n`, `db/migrations`, `scripts`, `tests/{unit,integration,e2e,fixtures}` (пустые — с `.gitkeep`).
- [x] `vercel.json`: `{"regions": ["fra1"]}` (+ `$schema`).

### 3.2 Качество кода
- [x] ESLint 9 flat config: `eslint-config-next` (core-web-vitals + typescript, это typescript-eslint) + `eslint-config-prettier`; Prettier 3.
- [x] Правило границ: для `src/domain/**` `no-restricted-imports` запрещает `next`, `react`, `react-dom`, `@/server/*`, `@/ui/*`, `drizzle-orm`, `pg`, `@neondatabase/*` (и относительные `../server`, `../ui`). Проверено (раздел 5.3).
- [x] Скрипты: `dev`, `build`, `start`, `typecheck`, `lint`, `format`, `test`, `test:e2e`, `check:messages`, `db:generate`, `db:migrate`, `db:studio`, `sms:test` (+ `format:check`, `test:coverage`).

### 3.3 Окружение
- [x] `src/server/env.ts` (zod 4): ленивая проверка с кэшем; ошибка называет только имена переменных и правило, **значения не печатаются** (есть тест). Пустая строка из `.env.example` = «не задано».
  - Обязательные: `APP_URL` (на Preview — запасной `https://` + `VERCEL_URL`), `APP_DOMAIN` (≤ 20 символов, решение А2), `DATABASE_URL`, `SESSION_SECRET`, `OTP_HMAC_SECRET`, `CRON_SECRET` (≥ 32 символов).
  - Необязательные модули выключаются без своих переменных: `env().smsc`, `env().mobizon`, `env().s3` = `null`, `sentryEnabled = false`.
  - Сервер падает **при старте** (`src/instrumentation-node.ts`, `process.exit(1)`) с понятным сообщением — проверено на standalone-сборке (раздел 5.7). Во время `next build` проверка пропускается.
- [x] `.env.example` — ровно состав брифа, значения пустые, кроме безопасных значений по умолчанию.

### 3.4 База
- [x] `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, `pg`.
- [x] `drizzle.config.ts`: миграции в `db/migrations`, подключение через `DATABASE_URL_UNPOOLED` (без неё — понятная ошибка); `.env.local` читается через `@next/env`.
- [x] `src/server/db.ts`: `DATABASE_DRIVER=neon` → `drizzle-orm/neon-serverless` + `Pool` из `@neondatabase/serverless` (интерактивные транзакции понадобятся в Ф2); `pg` → `drizzle-orm/node-postgres`. Ленивая инициализация. `pingDb()` — `select 1` с таймаутом 5 с, никогда не бросает, деталей ошибки не отдаёт.
- [x] `db/migrations/0000_init.sql` — только `create extension if not exists pgcrypto;` (создана `drizzle-kit generate --custom --name=init`). `src/server/schema.ts` пустой (таблицы — Ф2).
- [x] `GET /api/health` → `{ ok, commit, db, time }`; `commit` = первые 7 символов `VERCEL_GIT_COMMIT_SHA` / `GIT_COMMIT` / `"dev"`; `cache-control: no-store`.

### 3.5 Тексты и язык
- [x] next-intl 4 без маршрутизации. `src/i18n/request.ts`: язык из cookie `locale` (`kk` | `ru`, по умолчанию `kk`), сообщения — **импортом** `content/messages/kk.json` / `ru.json` (явные импорты, чтобы в сборку не попали `_keys.json` и `_context.json`). `<html lang>` = текущий язык. Копий текстов в `src/` нет.
- [x] Временная страница `/` на нейтральных стилях: `common.actions.save`; `common.units.seats` (`plural`, count 5); `events.kind.select` (`{kind, select}`, `kyz_uzatu`); `guests.list.counters.yes` (`\n` + `plural` в ru, `white-space: pre-line`); ссылка на `/api/health`; временный переключатель (подписи — `common.lang.*`, server action `src/server/actions/locale.ts` с zod).
- [x] Шрифты не подключались.
- [x] `scripts/check-messages.ts` (`tsx`, `@formatjs/icu-messageformat-parser`): все 6 проверок брифа; ненулевой код и список нарушений; `--dir` для фикстур. Unit-тесты на фикстурах `tests/fixtures/messages/{valid,broken}`.
- [x] Unit-тест `sms.otp` ≤ 70 символов в обоих языках: kk **70**, ru **66** (последняя строка — `@toi-pilot.vercel.app #482913`).

### 3.6 SMS
- [x] `src/server/sms/`: интерфейс `SmsProvider`, `ConsoleProvider`, `SmscKzProvider` (`/sys/send.php`, `/sys/status.php`, `fmt=3`, POST — логин/пароль не попадают в URL), `MobizonProvider` (`api.mobizon.kz/service/message/sendsmsmessage|getsmsstatus`, `apiKey` в query по документации; URL нигде не логируется, сетевые ошибки переупаковываются без URL). Ссылки на документацию — в комментариях. Фабрика `createSmsProvider` возвращает `null`, если у провайдера нет переменных.
- [x] `src/domain/guests/phone.ts`: `normalizePhone` → `+7XXXXXXXXXX` по логике `normPhone` прототипа; `maskPhone` → `+7 701 *** ** 67`. Тесты: «8 701 …», «+7 (701) …», «701…», «7701…», мусор.
- [x] `scripts/sms-test.ts`: аргументы как в брифе; отказ для номера не из `SMS_TEST_ALLOWLIST`; текст — `sms.otp` (случайный код + `APP_DOMAIN`); опрос статуса каждые 5 с до 90 с; строка отчёта `| оператор | провайдер | отправлено | статус | доставлено через, с | стоимость | id |`; телефон замаскирован.

### 3.7 Тесты и CI
- [x] Vitest 5 (покрытие v8), Playwright 1.64, проекты `mobile` 360×740 и `desktop` 1440×900. Smoke: `lang="kk"`, cookie → `lang="ru"`, `/api/health` → `db: "ok"` (+ проверка переключателя и формы ответа health).
- [x] `.github/workflows/ci.yml` (PR и push в `main`, Node 24, кэш pnpm): install `--frozen-lockfile` → `check:messages` → `typecheck` → `lint` → `test:coverage` → `build` → `db:migrate` на сервисе `postgres:16` → Playwright smoke против `next start` (`DATABASE_DRIVER=pg`) → отдельные jobs `docker build` (без публикации) и `gitleaks` (вся история).
- [x] `Dockerfile`: multi-stage `node:24-bookworm-slim`, `standalone` + `static` + `public`, `USER node`, `HEALTHCHECK` на `/api/health`; `.dockerignore`; `docker-compose.yml` (postgres 16 + minio) — на будущее, не обязателен.
- [x] Sentry (`@sentry/nextjs` 11): включается только при `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`; строгий `dataCollection` (эквивалент `sendDefaultPii: false`, см. отклонение 2); `beforeSend` (`src/sentry.scrub.ts`) удаляет `request.data` и `request.cookies` и маскирует телефоны во всём событии. Загрузка source maps — только при `SENTRY_AUTH_TOKEN`.

### 3.8 Документы для агентов
- [x] `AGENTS.md` (структура 11.1 и границы, запреты 4.4, тексты/А5, секреты, ветки, 13.5/13.6, отклонения; внизу — служебный блок Next.js, который `next dev` всё равно дописывает).
- [x] `CLAUDE.md` — одна строка со ссылкой на `AGENTS.md`.
- [x] `README.md` — что это, запуск (pnpm, `.env.local`, ветка Neon `dev`), команды, где документы.

### Не сделано (нужны аккаунты) — раздел 10
Vercel-проект и preview, Neon и ветки на PR, R2, Sentry-проект, отчёт о доставке SMS.

## 3. Изменённые файлы

`git diff --stat main...phase/F0-setup` (без `pnpm-lock.yaml`): **67 files changed, 9379 insertions(+)**, из них ~6 900 — lockfile. Новые файлы:

```
.dockerignore  .env.example  .github/workflows/ci.yml  .prettierignore  .prettierrc.json
AGENTS.md  CLAUDE.md  README.md  Dockerfile  docker-compose.yml
drizzle.config.ts  eslint.config.mjs  next.config.ts  package.json  pnpm-lock.yaml  pnpm-workspace.yaml
playwright.config.ts  vitest.config.ts  tsconfig.json  vercel.json  sentry.server.config.ts  public/.gitkeep
db/migrations/0000_init.sql  db/migrations/meta/{_journal.json,0000_snapshot.json}
scripts/check-messages.ts  scripts/sms-test.ts
src/app/{layout.tsx,page.tsx,globals.css,favicon.ico}  src/app/api/health/route.ts
src/domain/guests/phone.ts  src/domain/{seating,invitations}/.gitkeep
src/i18n/{config.ts,request.ts}
src/instrumentation.ts  src/instrumentation-node.ts  src/instrumentation-client.ts  src/sentry.scrub.ts
src/server/{env.ts,db.ts,schema.ts}  src/server/actions/locale.ts  src/server/sms/{types,console,smsc,mobizon,index}.ts
src/server/{auth,storage}/.gitkeep  src/ui/.gitkeep
tests/unit/{check-messages,sms-otp-length,phone,env,sentry-scrub,sms-providers}.test.ts
tests/e2e/smoke.spec.ts  tests/fixtures/messages/{valid,broken}/{_keys,kk,ru}.json  tests/integration/.gitkeep
```

В `main` дополнительно: `.gitignore`, `.gitattributes` (`* text=auto eol=lf`).

### Версии и зависимости

| Пакет | Версия | Зачем |
|---|---|---|
| next / eslint-config-next / @next/env | 16.4.0 | фреймворк; `@next/env` — загрузка `.env.local` в `drizzle.config.ts` и `sms:test` (отклонение 4) |
| react / react-dom | 19.3.0 | |
| typescript | 5.9.3 | бриф: 5.x |
| tailwindcss / @tailwindcss/turbopack | 4.3.3 | Tailwind v4 (отклонение 5) |
| next-intl | 4.14.9 | i18n без маршрутизации |
| drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 | ORM, миграции |
| @neondatabase/serverless / pg (+@types/pg) | 1.2.0 / 8.23.1 | драйверы (план 4.4) |
| zod | 4.6.5 | env, входы |
| @sentry/nextjs | 11.5.0 | ошибки |
| @formatjs/icu-messageformat-parser | 3.5.21 | `check:messages` |
| tsx | 4.23.15 | запуск скриптов |
| vitest / @vitest/coverage-v8 | 5.0.3 | unit |
| @playwright/test | 1.64.0 | e2e |
| eslint / eslint-config-prettier / prettier | 9.39.5 / 10.1.8 / 3.9.9 | |
| @types/node | 24.19.1 | |
| pnpm (`packageManager`) | 12.10.1 | `engines.node >= 22` |

Новые переменные окружения: только из `.env.example` брифа. Дополнительно читаются системные `VERCEL_URL`, `VERCEL_GIT_COMMIT_SHA`, `GIT_COMMIT` (сборка Docker/CI), `E2E_PORT`, `E2E_CHANNEL` (только Playwright).

## 4. Миграции

- `db/migrations/0000_init.sql`: `create extension if not exists pgcrypto;` — только расширяющая, стандартное расширение (4.4 п.1).
- Накат с нуля проверен локально `pnpm db:migrate` на Postgres-совместимом сервере (PGlite, см. 5.6): `[✓] migrations applied successfully!`. В CI накат идёт на `postgres:16` перед Playwright. Сида в Ф0 нет.

## 5. Тесты и проверки — реальный вывод

Машина: Windows 11, Node 24.18.0, pnpm 12.10.1. Docker нет.

### 5.1 `pnpm check:messages`
```
$ tsx scripts/check-messages.ts
check:messages: OK — 757 keys, kk/ru: ICU, variables, tags, select/other, ru plural forms
```
На сломанной фикстуре (`pnpm check:messages --dir tests/fixtures/messages/broken`, то же проверяет unit-тест):
```
check:messages: 4 violation(s) in D:\My Project\toi\tests\fixtures\messages\broken (4 keys)
  [keys] extra: missing in _keys.json
  [keys] extra: missing in ru.json
  [ru-plural] common.seats: {count, plural} is missing few
  [variables] consent: kk {name} ≠ ru {}
[ELIFECYCLE] Command failed with exit code 1.
```

### 5.2 `pnpm typecheck`
```
$ next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully
```
(код 0, ошибок нет)

### 5.3 `pnpm lint` и правило границ
```
$ eslint --max-warnings=0
```
(код 0). Проверка правила границ — во `src/domain/guests/phone.ts` временно добавлены `import "next/headers"; import "@/server/db"; import "drizzle-orm";`:
```
D:\My Project\toi\src\domain\guests\phone.ts
  1:1  error  'next/headers' import is restricted from being used by a pattern. src/domain is pure TS: no Next.js (plan 11.1)      no-restricted-imports
  2:1  error  '@/server/db' import is restricted from being used by a pattern. src/domain must not import server code (plan 11.1)  no-restricted-imports
  3:1  error  'drizzle-orm' import is restricted from being used by a pattern. src/domain has no DB access (plan 11.1)             no-restricted-imports
✖ 3 problems (3 errors, 0 warnings)
[ELIFECYCLE] Command failed with exit code 1.
```
Откачено, `pnpm lint` снова код 0. `pnpm format:check`: `All matched files use Prettier code style!`

### 5.4 `pnpm test` (Vitest) — 42 теста, 6 файлов
```
 Test Files  6 passed (6)
      Tests  42 passed (42)
```
Список unit-тестов:
- `check-messages.test.ts`: корректная фикстура проходит; сломанная падает (лишний ключ, разные переменные, нет `few`); CLI — код 1 / 0; разные теги rich text, `select` без `other`, пустое значение, ошибка ICU; реальные `content/messages` (757 ключей) проходят.
- `sms-otp-length.test.ts`: kk и ru — `sms.otp` с `482913` и `toi-pilot.vercel.app` ≤ 70 символов, последняя строка WebOTP.
- `phone.test.ts`: 6 корректных форматов → `+77011234567`/`+77771234567`; 7 вариантов мусора → `null`; маска.
- `env.test.ts`: значения по умолчанию и выключенные модули; пустая строка = не задано; имя переменной в ошибке и **отсутствие значений** в тексте ошибки; `APP_DOMAIN` > 20 → ошибка; модули включаются при наличии переменных; запасной `VERCEL_URL`.
- `sentry-scrub.test.ts`: маскировка 5 форматов номера; удаление тела запроса и cookies, телефоны в глубине события.
- `sms-providers.test.ts`: соответствие статусов SMSC/Mobizon; SMSC — POST, учётные данные не в URL, разбор `fmt=3`; ошибки без пароля; Mobizon — отправка и статус; сетевая ошибка без URL с ключом; фабрика выключает провайдеров без ключей; нормализация allowlist.

Покрытие `src/domain` (`vitest run --coverage --coverage.include='src/domain/**'`): **100 %** statements / branches / functions / lines (1 файл, `phone.ts`).

### 5.5 `pnpm build`
```
▲ Next.js 16.4.0 (Turbopack)
✓ Compiled successfully in 43s
  Running TypeScript ...
✓ Generating static pages using 6 workers (4/4)
Route (app)
┌ ƒ /
├ ƒ /_not-found
└ ƒ /api/health
```
Предупреждений нет. Создаётся `.next/standalone/server.js`. Standalone-сервер запущен локально (`node server.js` после копирования `static` и `public`): `/` отдаёт `<html lang="kk"`, `/api/health` — `HTTP/1.1 503` и `{"ok":false,"commit":"dev","db":"error",…}` без базы.

### 5.6 Playwright smoke
Скачивание Chromium (`playwright install chromium`) на этой машине зависло >10 мин, поэтому локально — установленный Chrome через `E2E_CHANNEL=chrome` (в CI — штатный Chromium, `--with-deps`).

a) Без базы (`E2E_CHANNEL=chrome pnpm test:e2e`, после `pnpm build`):
```
  -   2 [mobile]  › /api/health answers db: ok          (skipped: No Postgres: DATABASE_URL is not set …)
  ok  5 [mobile]  › /api/health has the documented shape and no extra details
  ok  1 [mobile]  › locale cookie ru → html[lang=ru] and Russian strings
  ok  4 [mobile]  › / opens in Kazakh by default with html[lang=kk]
  ok  3 [mobile]  › temporary switcher sets the cookie and switches language
  ok  6 [desktop] › / opens in Kazakh by default with html[lang=kk]
  -   9 [desktop] › /api/health answers db: ok          (skipped)
  ok 10 [desktop] › /api/health has the documented shape and no extra details
  ok  7 [desktop] › locale cookie ru → html[lang=ru] and Russian strings
  ok  8 [desktop] › temporary switcher sets the cookie and switches language
  2 skipped
  8 passed (16.9s)
```
b) С Postgres-совместимой базой: PGlite + `@electric-sql/pglite-socket` с расширением pgcrypto, запущены **вне репозитория** (scratchpad) на `127.0.0.1:5433`, драйвер `pg`. `pnpm db:migrate` → `migrations applied successfully!`, затем smoke:
```
  ok  4 [mobile]  › /api/health answers db: ok (1.9s)
  ok  9 [desktop] › /api/health answers db: ok (106ms)
  … остальные 8 ok
  10 passed (25.6s)
```
Это не настоящий Postgres 16; полная проверка — в CI на `postgres:16` и на preview с Neon. Драйвер `neon` локально не проверен (нужен Neon) — **ожидает основателя**.

### 5.7 Падение без обязательной переменной
Standalone-сервер без `DATABASE_URL` и секретов:
```
Invalid environment configuration:
  - DATABASE_URL: is required
  - SESSION_SECRET: is required
  - OTP_HMAC_SECRET: is required
  - CRON_SECRET: is required
See .env.example (local: .env.local; Vercel: Project → Settings → Environment Variables).
exit=1
```

### 5.8 `pnpm sms:test` без аккаунтов (пути отказа)
```
sms:test: SMSC_LOGIN / SMSC_PASSWORD are not set (.env.local)
sms:test: +7 701 *** ** 67 is not in SMS_TEST_ALLOWLIST — refusing to send
sms:test: --provider must be smsc or mobizon, got "foo"
```
Реальная отправка — ожидает основателя.

### 5.9 gitleaks
gitleaks 8.24.0 (бинарник из GitHub Releases, лежит вне репозитория), вся история:
```
INF 3 commits scanned.
INF scanned ~2239132 bytes (2.24 MB) in 2.18s
INF no leaks found
```
(все 3 коммита на момент проверки: `e1b3fd3`, `10aec5f`, `d7d0449`.)

### 5.10 Чистый клон (имитация CI)
`git clone -b phase/F0-setup` во временную папку → `pnpm install --frozen-lockfile` (Done in 18s) → `check:messages` OK → `typecheck` OK → `lint` OK → `test` 41/41 (до последнего коммита) → `build` `✓ Compiled successfully`. Значит, сборка не зависит от неотслеживаемых файлов.

### 5.11 Docker
Локально не собирался (Docker нет, бриф п.2). Собирается в CI, job `docker`. **Ожидает первого прогона CI.**

## 6. Скриншоты
Ф0 без интерфейса по дизайну. Скриншоты настроек Vercel/Neon/Sentry — ожидают основателя (аккаунтов нет).

## 7. Критерии приёмки

| № | Критерий | Статус | Как проверено |
|---|---|---|---|
| 1 | `pnpm install && pnpm dev`: kk-строки из `content/messages`, после переключения — ru, `<html lang>` меняется | **выполнен локально** (на production-сборке) | Playwright smoke: `lang=kk` по умолчанию, cookie → `lang=ru`, кнопки переключателя туда и обратно, тексты сверяются с JSON. Для `pnpm dev` у основателя нужен `.env.local` (иначе сервер остановится с перечнем переменных — так и задумано) |
| 2 | `check:messages` проходит на 757 ключах и падает на сломанной фикстуре | **выполнен** | 5.1, 5.4 |
| 3 | CI зелёный локально и на GitHub | **локально — да** (typecheck, lint, test, build, smoke в обоих проектах, gitleaks); Docker и GitHub — **ожидает основателя** | 5.2–5.6, 5.9, 5.10 |
| 4 | Пробный импорт `next` из `src/domain` ломает lint | **выполнен** | 5.3 |
| 5 | PR → preview со своей веткой Neon, `/api/health` → `db: "ok"` | **ожидает основателя** (GitHub, Vercel, Neon) | — |
| 6 | Прод `toi-pilot.vercel.app`, `/api/health` → ok, `fra1` | **ожидает основателя**; `vercel.json` с `fra1` готов | — |
| 7 | Секреты не утекли; `.env.example` полный; без обязательной переменной — понятное падение | **выполнен** | 5.9 (gitleaks), `.env.example` = состав брифа, 5.7, тест `env.test.ts` |
| 8 | Отчёт SMS по операторам (минимум Kcell/Activ и Tele2) | **ожидает основателя** (SMSC.kz, Mobizon, 4 номера) | шаблон отчёта — раздел 9 |
| 9 | `AGENTS.md`, `CLAUDE.md`, `README.md`; структура 11.1; документы не перемещены | **выполнен** | файлы в корне; `git diff main...` не трогает папки документов |

## 8. Отклонения от брифа и плана

1. **pnpm.** `corepack enable` упал: `EPERM: operation not permitted, open 'C:\Program Files\nodejs\yarnpkg'` (нет прав на Program Files). Сработало `corepack enable pnpm --install-directory "%APPDATA%\npm"` (папку пришлось создать). Corepack поставил последнюю pnpm — **12.10.1**, она и зафиксирована в `packageManager`. В pnpm 12 сборочные скрипты зависимостей по умолчанию запрещены: в `pnpm-workspace.yaml` разрешён только `esbuild`; `sharp`, `unrs-resolver`, `@parcel/watcher`, `@swc/core` — запрещены (у них готовые бинарники).
2. **Sentry 11: `sendDefaultPii` больше нет.** В `@sentry/nextjs` 11 опцию заменил `dataCollection`. Поставлен строгий эквивалент (`userInfo`, `cookies`, `httpHeaders`, `urlQueryParams`, `databaseQueryData`, `queues`, `stackFrameVariables` — `false`, `httpBodies: []`, GraphQL и GenAI — выкл.) + `beforeSend` по брифу. `withSentryConfig` импортируется из `@sentry/nextjs/config` (в v11 он переехал).
3. **`SmsProvider.status(providerMsgId, to)`** — добавлен второй аргумент: `status.php` SMSC.kz требует телефон вместе с id. Mobizon его игнорирует.
4. **`@next/env`** явно в devDependencies (уже ставится вместе с `next`; pnpm не даёт импортировать транзитивные пакеты) — для чтения `.env.local` в `drizzle.config.ts` и `sms:test`.
5. **Tailwind v4 через `@tailwindcss/turbopack`**, без PostCSS — так генерирует `create-next-app` 16.4 (Turbopack по умолчанию и для `build`). Флаги шаблона `cacheComponents` и `partialPrefetching` не включены: в брифе их нет, а язык читается из cookie в корневом layout.
6. **`/api/health` отвечает HTTP 503 при `db: "error"`** (тело как в брифе) — чтобы `HEALTHCHECK` Docker и мониторинг видели проблему.
7. **Обязательные переменные:** секреты требуют ≥ 32 символов; `APP_DOMAIN` проверяется на ≤ 20 символов (А2); на Vercel Preview `APP_URL` можно оставить пустым — берётся `https://` + `VERCEL_URL` (у preview адрес меняется на каждый деплой). Проверка запускается при старте сервера через `src/instrumentation-node.ts` (`process.exit(1)`), при `next build` пропускается.
8. **gitleaks в CI — контейнер `ghcr.io/gitleaks/gitleaks:v8.24.0`** вместо `gitleaks-action` (тот требует лицензию для репозиториев организаций).
9. **Playwright против `next start`** — как в брифе, но Next 16 предупреждает: `"next start" does not work with "output: standalone"`. Smoke проходит; standalone-сервер отдельно проверен вручную (5.5), а в CI ещё собирается Docker-образ. Если архитектор предпочтёт, smoke можно перевести на `node .next/standalone/server.js`.
10. **Локальные e2e:** Chromium не скачался → `E2E_CHANNEL=chrome` (установленный Chrome). Проверка `db: "ok"` локально — на PGlite вне репозитория, не на Postgres 16 (5.6).
11. **`normalizePhone` строже прототипа:** прототип обрезал ввод до 10 цифр (для поля ввода), здесь лишние или недостающие цифры дают `null`, номер для хранения должен быть точным.
12. **Маска телефонов в Sentry шире** `\+?7\d{10}`: ловит и `8701…`, и форматы с пробелами/скобками/дефисами.
13. **Файлы вне списка 11.1:** `src/instrumentation.ts`, `src/instrumentation-node.ts`, `src/instrumentation-client.ts`, `sentry.server.config.ts` (соглашения Next/Sentry), `src/sentry.scrub.ts` (общий для сервера и браузера), `.gitattributes` (LF в репозитории), `.prettierrc.json`, `.prettierignore` (документы Prettier не трогает). Скрипты `format:check` и `test:coverage` — сверх списка; CI запускает `test:coverage`.
14. **`typecheck` = `next typegen && tsc --noEmit`:** глобальные типы `LayoutProps` и `next-env.d.ts` (по шаблону Next 16 он в `.gitignore`) генерируются `typegen`, на чистом клоне без него `tsc` падает.
15. **`.gitattributes` `eol=lf`:** часть документов в рабочей папке с CRLF. В репозиторий они легли с LF, сами файлы на диске не менялись.
16. **Git-идентичность:** глобальной не было, задана **локально для репозитория**: `Nauryzbek <nauryzbek@xintem.com>`. Основатель может поменять: `git config user.name "…"`.
17. **Параллельные правки дизайнера не закоммичены:** во время работы в `design/` появились изменения (`design/DESIGN_v2.md`, `design/v2/index.html`, новые `design/v2/screenshots/*.png`). Это не моя работа, в ветку фазы я их не включал. Они лежат в рабочей папке незакоммиченными, и их стоит закоммитить в `main` отдельно (дизайнер или основатель).
18. **Документация SMSC.kz** на странице частично нечитаема (кодировка). Значение статуса `4` и вариант «пароль или API-ключ» помечены `[ПРОВЕРИТЬ]` в `smsc.ts` — проверим на первой реальной отправке.

## 9. Отчёт о доставке SMS — шаблон (ожидает основателя)

Команды (8 запусков: 4 номера × 2 провайдера), каждый выводит строку таблицы:
```
pnpm sms:test --provider smsc    --to +7701XXXXXXX --operator Kcell  --lang kk
pnpm sms:test --provider mobizon --to +7701XXXXXXX --operator Kcell  --lang kk
… Beeline, Tele2, Altel
```

| оператор | провайдер | отправлено | статус | доставлено через, с | стоимость | id | человек: пришло? через, с |
|---|---|---|---|---|---|---|---|
| Kcell/Activ | smsc | | | | | | |
| Kcell/Activ | mobizon | | | | | | |
| Beeline | smsc | | | | | | |
| Beeline | mobizon | | | | | | |
| Tele2 | smsc | | | | | | |
| Tele2 | mobizon | | | | | | |
| Altel | smsc | | | | | | |
| Altel | mobizon | | | | | | |

## 10. Ожидает основателя (бриф, раздел 4)

Ничего из этого разработчик не делал: аккаунты не создавались, ключей нет.

| Шаг | Что | Что после этого делает разработчик |
|---|---|---|
| 1 | GitHub: приватный пустой `toi`, `gh auth login` | push `main` и ветки, PR, первый прогон CI (Docker, gitleaks, smoke на `postgres:16`) |
| 2 | Vercel: проект **`toi-pilot`**, Root `./`, проверить домен | preview на PR, проверка `fra1` |
| 3 | Neon (через Vercel), eu-central-1, ветки для Preview, ветка `dev` → `.env.local` | `/api/health` → `db: "ok"` на preview; локально `pnpm db:migrate` и `pnpm dev` |
| 4 | Cloudflare R2: `toi-prod`, `toi-preview` (EU), токен | (S3-код — в фазах с файлами; переменные уже в `env.ts`) |
| 5–7 | SMSC.kz (2 000 ₸), Mobizon, 4 тестовых номера → `SMS_TEST_ALLOWLIST` | `sms:test`, отчёт раздела 9 |
| 8 | Sentry DSN (можно позже) | проверка тестовой ошибки и маскировки |
| 9 | Секреты в `.env.local` и Vercel (Production + Preview, у Preview `SMS_PROVIDER=console`) | — |

## 11. Самопроверка по чек-листу 13.6

- [x] Задачи фазы: локальные — выполнены; требующие аккаунтов — подготовлены и перечислены в разделе 10.
- [ ] Критерии на preview URL — невозможно до Vercel (раздел 10).
- [x] Отклонения записаны (раздел 8); архитектура не менялась.
- [x] `src/domain` без импортов `server`/`ui`/`next` — правило ESLint работает.
- [x] Единственный Server Action (`setLocale`) валидирует вход через zod; authz не нужен (меняет только cookie языка у самого посетителя). Route handler `/api/health` публичный, без входных данных.
- [x] Запретов 4.4 нет: обычный Postgres + `pgcrypto`, `db.ts` с двумя драйверами, Vercel KV/Blob/Edge Config не используются, Edge-only кода нет, `output: "standalone"`, Dockerfile в CI.
- [x] Новые зависимости — только из брифа + `@next/env` (отклонение 4) + `@tailwindcss/turbopack` (5) + `eslint-config-prettier`.
- [x] Захардкоженных строк интерфейса нет: на `/` всё из `content/messages`; ключи вида `common.actions.save` и `/api/health` показаны как техническая подпись временной страницы.
- [x] Миграция одна, расширяющая, накатывается с нуля.
- [x] ПДн: телефоны маскируются в выводе `sms:test`, в `ConsoleProvider` и Sentry; ключи провайдеров не попадают в URL (SMSC) или в ошибки (Mobizon); значения env не печатаются.
- [x] `dangerouslySetInnerHTML` нет.
- [x] Unit и e2e зелёные локально; в CI — после появления GitHub.
- [x] Кода из будущих фаз нет: схема, вход, UI по дизайну, лимиты SMS и `sms_log` не начаты.
