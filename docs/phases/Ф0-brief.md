# Ф0 · Старт и проверки — бриф разработчику

Версия 1.0 · 2026-10-09 · архитектор → full-stack разработчик (агент)
Статус: **готов к работе**. Ворота «Дизайн» закрыты (`docs/DECISIONS.md`, Д1).
Оценка: **1,5 рабочих дня** + ревью. Локальную часть (раздел 3) можно начинать сразу, не дожидаясь аккаунтов.

Прочитать перед началом:
- `architecture/ARCHITECTURE_PLAN.md` v1.3, разделы 2 (стек), 4.4 (правила переносимости), 11 (репозиторий, окружения, CI), 12.3 Ф0, 13 (процесс, пакет сдачи, чек-лист ревью);
- `docs/DECISIONS.md` (А1, А2, А5, Д3, Д5);
- `content/CONTENT_REVIEW.md`, разделы 3 и 6.

---

## 1. Цель

Пустой, но правильно устроенный проект. Он собирается и проходит CI, деплоится на Vercel (preview на каждый PR, прод `toi-pilot.vercel.app`) и ходит в Neon. Показывает казахский и русский текст из `content/messages`, проверяет тексты в CI и умеет отправить тестовую SMS через SMSC.kz и Mobizon.

Отдельный результат фазы — **отчёт о доставке SMS по операторам**.

**Не входит в Ф0:** схема базы (кроме проверочной миграции), вход, интерфейс по дизайну, бизнес-логика. Это Ф1, Ф2 и Ф7a. Не писать «на будущее» код из этих фаз.

## 2. Принятые решения (в этой фазе не обсуждаются)

| Тема | Решение |
|---|---|
| Репозиторий | Вся папка `D:\My Project\toi\` (А1). Next.js лежит в корне, маршруты — в `src/app/`. Существующие папки (`architecture/`, `design/`, `content/`, `docs/`, `research/`, `prototype/`, файл `HANDOVER_v2.md`) **не переносить и не переименовывать** |
| Пакеты | pnpm. Node 24 установлен, pnpm нет: `corepack enable` (или `npm i -g pnpm`). Зафиксировать `packageManager` в `package.json`, `engines.node >= 22` |
| Версии | Последние стабильные Next.js (App Router), React 19, TypeScript 5.x, Tailwind CSS v4, next-intl, Drizzle. Закрепить lockfile |
| Тексты | Только из `content/messages/kk.json` и `ru.json` (757 ключей, финальные, Д5). Не копировать в `src/`, не переименовывать и не удалять ключи |
| Язык | По умолчанию `kk`, второй `ru`. Язык хранится в cookie `locale`, без префикса в URL (next-intl без i18n-маршрутизации) |
| Домен | `toi-pilot.vercel.app`, не длиннее 20 символов (А2). В коде только переменная `APP_DOMAIN`, без хардкода |
| База | Neon, AWS eu-central-1. Драйвер выбирается переменной `DATABASE_DRIVER=neon\|pg` (план 4.4) |
| Docker | На машине основателя Docker **не установлен**. Локальная база — ветка Neon `dev`. `docker-compose.yml` (postgres + minio) положить на будущее, но не требовать. Docker-образ собирается **в CI** |
| Секреты | Только в `.env.local` (он в `.gitignore`) и в настройках Vercel/GitHub. В репозитории лежит `.env.example` без значений. Секреты не попадают в коммиты, логи, вывод скриптов, отчёты и сообщения агентов |

## 3. Что делает разработчик локально (без доступа к аккаунтам)

### 3.1 Git и каркас
- [ ] `git init` в `D:\My Project\toi\`, ветка `main`. Первый коммит — `.gitignore` и существующие документы. Каркас — в ветке `phase/F0-setup`.
- [ ] `.gitignore`: `node_modules/`, `.next/`, `out/`, `coverage/`, `playwright-report/`, `test-results/`, `.vercel/`, `.env*` (кроме `!.env.example`), `*.log`, `.DS_Store`, `design/v2/covers/source/`.
- [ ] Каркас Next.js. `create-next-app` не работает в непустой папке, поэтому сгенерировать во временной папке **вне репозитория** и перенести нужные файлы (или собрать конфиги вручную). Требования:
  - TypeScript strict и `noUncheckedIndexedAccess`;
  - алиас `@/*` → `src/*`;
  - Tailwind v4;
  - маршруты в `src/app/`;
  - `next.config.ts` с `output: "standalone"`.
- [ ] Скелет папок по плану 11.1, пустые `.gitkeep` или `index.ts`: `src/domain/{seating,guests,invitations}`, `src/server/{auth,actions,sms,storage}`, `src/ui`, `src/i18n`, `db/migrations`, `scripts`, `tests/{unit,integration,e2e,fixtures}`.
- [ ] `vercel.json`: `{"regions": ["fra1"]}`.

### 3.2 Качество кода
- [ ] ESLint (flat config: `next` + `typescript-eslint`) и Prettier.
- [ ] **Правило границ:** для `src/domain/**` через `no-restricted-imports` запретить импорты `next`, `react`, `@/server/*`, `@/ui/*`, `drizzle-orm`, `pg`, `@neondatabase/*`.
- [ ] Скрипты `package.json`: `dev`, `build`, `start`, `typecheck` (`tsc --noEmit`), `lint`, `format`, `test`, `test:e2e`, `check:messages`, `db:generate`, `db:migrate`, `db:studio`, `sms:test`.

### 3.3 Окружение
- [ ] `src/server/env.ts` — проверка переменных через zod.
  - Без обязательной переменной приложение падает с понятным сообщением, какой именно переменной нет.
  - Необязательные модули (Sentry, SMS, S3) без своих переменных просто выключаются.
  - Значения переменных никогда не печатать.
- [ ] `.env.example`. Значения пустые, кроме безопасных значений по умолчанию:

```
# App
APP_URL=                    # https://toi-pilot.vercel.app (локально http://localhost:3000)
APP_DOMAIN=                 # toi-pilot.vercel.app — входит в SMS (WebOTP), ≤ 20 символов
# Database (Neon)
DATABASE_DRIVER=neon        # neon | pg
DATABASE_URL=               # pooled
DATABASE_URL_UNPOOLED=      # direct, для миграций
# Secrets (openssl rand -base64 32)
SESSION_SECRET=
OTP_HMAC_SECRET=
CRON_SECRET=
# SMS
SMS_PROVIDER=console        # console | smsc | mobizon
SMS_FALLBACK_PROVIDER=      # mobizon
SMS_DAILY_LIMIT=300
SMS_TEST_ALLOWLIST=         # +77011234567,+77771234567 — для sms:test и preview
SMSC_LOGIN=
SMSC_PASSWORD=              # пароль или API-ключ SMSC.kz [ПРОВЕРИТЬ по документации API]
SMSC_SENDER=                # пусто = общее имя по умолчанию
MOBIZON_API_KEY=
MOBIZON_API_DOMAIN=api.mobizon.kz
# Object storage (Cloudflare R2, S3 API)
S3_ENDPOINT=                # https://<accountid>.r2.cloudflarestorage.com (EU: <accountid>.eu.r2.cloudflarestorage.com)
S3_REGION=auto
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
# Monitoring
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=          # только CI, необязательно
```

### 3.4 База (только проводка)
- [ ] Зависимости: `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, `pg`.
- [ ] `drizzle.config.ts`: миграции в `db/migrations`, подключение через `DATABASE_URL_UNPOOLED`.
- [ ] `src/server/db.ts`: оба драйвера, выбор по `DATABASE_DRIVER`, ленивая инициализация.
- [ ] Первая миграция — только `create extension if not exists pgcrypto;`. Полная схема — в Ф2.
- [ ] `GET /api/health` → `{ ok, commit, db: "ok" | "error", time }`. Внутри `select 1`; без секретов и подробностей ошибок.

### 3.5 Тексты и язык
- [ ] next-intl без маршрутизации. `src/i18n/request.ts`: язык из cookie `locale` (`kk` | `ru`, по умолчанию `kk`), сообщения импортируются из `content/messages/${locale}.json`. `<html lang>` равен текущему языку.
- [ ] Временная страница `/` на нейтральных стилях (**не** дизайн v2). На ней:
  - 4 строки из `content/messages` с примерами значений: `common.actions.save`, строка с `plural`, строка с `{kind, select}`, строка с `\n` (`white-space: pre-line`);
  - ссылка на `/api/health`;
  - временный переключатель языка для проверки.

  Финальная смена языка (меню «⋯», Д3) — в Ф1.
- [ ] Шрифты не подключать: это Ф1 и Ф5. Подмножества уже лежат в `design/v2/assets/fonts/`.
- [ ] `scripts/check-messages.ts` (запуск через `tsx`, зависимость `@formatjs/icu-messageformat-parser`). Логика по `CONTENT_REVIEW.md`, раздел 3:
  - одинаковые наборы ключей в `content/messages/_keys.json`, `kk.json`, `ru.json`;
  - нет пустых значений;
  - все сообщения проходят ICU-разбор;
  - по каждому ключу kk ↔ ru совпадают переменные **и** теги rich text;
  - у каждого `select` есть ветка `other`;
  - у ru `plural` есть `one`, `few`, `many`, `other`.

  При нарушениях — ненулевой код выхода и список нарушений. Unit-тест на фикстурах: корректный набор проходит; сломанный (лишний ключ, разные переменные, нет `few`) падает.
- [ ] Unit-тест: `sms.otp` с `code=482913` и `domain=toi-pilot.vercel.app` укладывается в 70 символов в обоих языках (защита решения А2).

### 3.6 SMS: интерфейс и проверочный скрипт
- [ ] `src/server/sms/`:
  - интерфейс `SmsProvider { send(to, text) → { providerMsgId, status }; status(providerMsgId) → "queued" | "sent" | "delivered" | "failed" | "unknown" }`;
  - реализации `ConsoleProvider`, `SmscKzProvider` (`smsc.kz/sys/send.php` и `/sys/status.php`, ответ JSON при `fmt=3`), `MobizonProvider` (REST `api.mobizon.kz`, `apiKey`).

  Параметры API брать из официальной документации; ссылку оставить комментарием в коде. Логика входа, лимиты и `sms_log` — в Ф2.
- [ ] `src/domain/guests/phone.ts` — нормализация в E.164 (`+77XXXXXXXXX`) по логике `normPhone` из прототипа. Unit-тесты на «8 701 …», «+7 (701) …», «701…» и мусор.
- [ ] `scripts/sms-test.ts`: `pnpm sms:test --provider smsc|mobizon --to +7701… [--lang kk|ru] [--operator Kcell]`.
  - Номер не из `SMS_TEST_ALLOWLIST` — отказ.
  - Текст — `sms.otp` со случайным кодом и `APP_DOMAIN`.
  - После отправки опрашивать статус до 90 с.
  - Вывести строку отчёта `| оператор | провайдер | отправлено | статус | доставлено через, с | стоимость | id |`. Телефон в выводе замаскирован: `+7 701 *** ** 67`.

### 3.7 Тесты и CI
- [ ] Vitest (unit, покрытие v8) и Playwright, проекты `mobile` 360×740 и `desktop` 1440×900. Smoke-тест проверяет три вещи:
  - `/` открывается с `html[lang="kk"]`;
  - после смены cookie — `lang="ru"`;
  - `/api/health` отвечает `db: "ok"`.
- [ ] `.github/workflows/ci.yml` (на PR и push в `main`, Node 24, кэш pnpm):
  1. `pnpm install --frozen-lockfile`;
  2. `check:messages`;
  3. `typecheck`, `lint`, `test`;
  4. `build`;
  5. Playwright smoke против `next start` с сервисом `postgres:16` (`DATABASE_DRIVER=pg`, перед стартом `db:migrate`);
  6. `docker build` без публикации;
  7. `gitleaks`.
- [ ] `Dockerfile`: multi-stage, `node:24-bookworm-slim`, копирует `standalone` + `static` + `public`, `USER node`, `HEALTHCHECK` на `/api/health`. Плюс `.dockerignore`.
- [ ] Sentry (`@sentry/nextjs`):
  - включается только при заданном DSN;
  - `sendDefaultPii: false`;
  - `beforeSend` маскирует номера (`\+?7\d{10}`) и удаляет тела запросов.

### 3.8 Документы для агентов
- [ ] `AGENTS.md`: короткие правила со ссылками на разделы плана:
  - структура 11.1 и границы `src/domain`;
  - запреты 4.4;
  - тексты только из `content/messages`; при расхождении с макетом побеждают они (А5);
  - секреты только в env;
  - одна фаза — одна ветка `phase/F{N}-…`;
  - пакет сдачи 13.5 и самопроверка 13.6;
  - любое отклонение от брифа — в handover.
- [ ] `CLAUDE.md` — одна строка со ссылкой на `AGENTS.md`.
- [ ] `README.md`: что это, как запустить локально (pnpm, `.env.local`, ветка Neon `dev`), команды, где лежат документы.

## 4. Что делает только основатель

Здесь нужны аккаунты, оплата и личные телефоны. Разработчик не создаёт аккаунты и не получает пароли или ключи в чат. Основатель сам вставляет секреты в `.env.local` на своей машине и в настройки Vercel. Разработчику сообщает только, что готово, — а также URL репозитория и имя проекта.

### 4.1 Чек-лист основателя (≈ 1,5–2 часа)

1. **GitHub.** Создать **приватный** пустой репозиторий `toi` (без README и .gitignore). Выполнить `gh auth login` на этой машине. Сообщить URL.
2. **Vercel.** Add New → Project → импортировать `toi`:
   - **Project Name: `toi-pilot`**, Framework: Next.js, Root Directory: `./`;
   - проверить домен `toi-pilot.vercel.app`; если занят — взять имя ≤ 9 символов (`toipilot`, `toi-kz`, `toi-app`) и сообщить;
   - первый деплой может упасть без переменных — это нормально.
3. **Neon** (через Vercel):
   - проект → Storage → Create Database → **Neon**, регион **AWS Frankfurt (eu-central-1)**, имя `toi`;
   - включить ветки базы для **Preview**;
   - в консоли Neon создать ветку **`dev`** и её строки подключения (pooled и direct) записать в `.env.local`.
4. **Cloudflare R2:**
   - включить R2 (может понадобиться карта; бесплатно 10 ГБ);
   - создать бакеты `toi-prod` и `toi-preview` с jurisdiction **EU**;
   - создать API-токен *Object Read & Write* только на эти бакеты;
   - Account ID, Access Key ID и Secret внести в `.env.local` и Vercel;
   - публичный доступ не включать.
5. **SMSC.kz:**
   - зарегистрироваться и пополнить баланс на **2 000 ₸**;
   - разрешить отправку через API, взять логин и пароль или API-ключ;
   - имя отправителя не регистрировать (используется общее).
6. **Mobizon.** Зарегистрироваться, взять API-ключ. Для теста хватит бонуса 100 ₸.
7. **Тестовые номера.** 4 номера родственников, с их согласия: **Kcell/Activ, Beeline, Tele2, Altel**. Внести их в `SMS_TEST_ALLOWLIST`. Во время теста быть рядом и отметить, пришла ли SMS и через сколько секунд.
8. **Sentry** (можно позже). Создать проект Next.js, взять DSN.
9. **Секреты:**
   - сгенерировать `SESSION_SECRET`, `OTP_HMAC_SECRET`, `CRON_SECRET` (`openssl rand -base64 32`);
   - внести все переменные из `.env.example` в Vercel — отдельно для Production и Preview (у Preview `SMS_PROVIDER=console`);
   - те же переменные внести в `.env.local`;
   - в чат не отправлять, не коммитить.

### 4.2 Что сообщить разработчику (без секретов)

URL репозитория; имя проекта Vercel и итоговый домен; «Neon подключён, ветка `dev` в `.env.local`»; «R2, SMSC, Mobizon — ключи в `.env.local` и Vercel»; какие операторы есть среди тестовых номеров.

### 4.3 Если аккаунты задерживаются

Разработчик всё равно делает раздел 3 целиком с `SMS_PROVIDER=console`.
- **Нет Neon:** база проверяется только в CI на сервисном Postgres. Локально `/api/health` показывает `db: "error"` — это допустимо.
- **Нет SMS-аккаунтов:** отчёт о доставке сдаётся дополнением к Ф0 и не блокирует Ф2 (там SMS — только запасной вход).

## 5. Порядок работы

1. Локальная часть 3.1–3.8 в ветке `phase/F0-setup` (≈ 1 день).
2. После шага 1 основателя:
   - `git remote add origin …`;
   - push `main` (только документы);
   - push ветки и PR;
   - CI зелёный → preview на Vercel.
3. После шагов 2, 3 и 9 основателя:
   - на preview `/api/health` отвечает `db: "ok"` на своей ветке Neon;
   - мерж → прод.

   В Ф0 прод деплоится **через Git-интеграцию Vercel**. Переход на `deploy-prod.yml` (сначала миграции, потом деплой) — в Ф2, когда появится схема.
4. После шагов 5–7 основателя: `sms:test`, 4 номера × 2 провайдера, итоговый отчёт.

## 6. Критерии приёмки

1. `pnpm install && pnpm dev`: на `/` казахские строки из `content/messages`, после переключения — русские; `<html lang>` меняется.
2. `pnpm check:messages` проходит на 757 ключах и падает на сломанной фикстуре (unit-тест).
3. CI зелёный локально и на GitHub:
   - `typecheck`, `lint`, `test`, `build`;
   - Playwright smoke в обоих проектах;
   - сборка Docker-образа;
   - `gitleaks` без находок.
4. Правило границ работает: пробный импорт `next` из `src/domain` ломает `lint` (проверить и откатить).
5. Каждый PR получает preview со своей веткой Neon; `/api/health` на preview отвечает `db: "ok"`.
6. Прод `https://toi-pilot.vercel.app` (или согласованный домен ≤ 20 символов) отвечает, `/api/health` → `ok`, функции работают в `fra1`.
7. Секреты не утекли:
   - в истории git их нет;
   - `.env.example` полный;
   - без обязательной переменной приложение падает с понятным сообщением.
8. Отчёт SMS — таблица по операторам и провайдерам. Минимум: **подтверждена доставка на Kcell/Activ и Tele2**. Провал Beeline с общим именем ожидаем — записывается как результат, а не ошибка.
9. `AGENTS.md`, `CLAUDE.md`, `README.md` на месте; структура соответствует плану 11.1; существующие документы не перемещены.

## 7. Пакет сдачи (`docs/phases/Ф0-handover.md`, план 13.5)

Общая часть 13.5, пункты 1–9. Дополнительно для Ф0:
- ссылки на PR, preview и прод + ответы `/api/health` с обоих;
- скриншоты настроек Vercel (регион, имя, Git) и Neon (регион, ветки) — **без секретов**;
- вывод `check:messages` и список unit-тестов;
- **отчёт о доставке SMS**: таблица из `sms:test` + отметки людей «пришло / не пришло, через сколько»;
- версии Next.js, React, TypeScript, Tailwind, next-intl, Drizzle;
- отклонения от брифа и пункты раздела 4, которые основатель ещё не сделал.

## 8. Акценты ревью

- Регион `fra1`, сборка `standalone`, Docker-образ собирается.
- Нет ничего из запретов плана 4.4.
- Тексты берутся из `content/messages` без копий, проверка строгая.
- Правило границ `src/domain` работает.
- Секреты нигде не утекли: git, логи, вывод скриптов, сообщения.
- Никаких лишних библиотек и кода из будущих фаз.
