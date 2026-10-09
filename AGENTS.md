# Правила для агентов «Той»

Короткая выжимка. Источник правды — `architecture/ARCHITECTURE_PLAN.md` (v1.3) и `docs/DECISIONS.md`. Бриф текущей фазы — `docs/phases/Ф{N}-brief.md`, он главнее этого файла.

## Структура и границы (план 11.1)
- Репозиторий = вся папка проекта (решение А1). Next.js в корне, маршруты в `src/app/`.
- Документы не переносить и не переименовывать: `architecture/`, `design/`, `content/`, `docs/`, `research/`, `prototype/`, `HANDOVER_v2.md`.
- `src/domain/**` — чистый TypeScript: **нельзя** импортировать `next`, `react`, `@/server/*`, `@/ui/*`, `drizzle-orm`, `pg`, `@neondatabase/*`. Правило ESLint `no-restricted-imports` ломает `pnpm lint` при нарушении. Всё в `domain` покрыто unit-тестами.
- Server Actions тонкие: authz → zod → транзакция → domain → запись.
- База — только через `src/server/db.ts`; переменные окружения — только через `src/server/env.ts`.

## Запреты (план 4.4)
- Только обычный Postgres и стандартные расширения (`pgcrypto`, `pg_trgm`); никаких `auth.*`, `storage.*`, Supabase/Neon-специфики.
- Не использовать Vercel KV, Blob, Edge Config, Vercel Postgres, `@vercel/og` (только `next/og`); никакого кода только для Edge runtime.
- Файлы — только S3 API; rate limit — в Postgres; фоновые задачи — route handlers `/api/cron/*` с секретом.
- `output: "standalone"`, Dockerfile собирается в CI. Время — `timestamptz`, пояс событий явно (`Asia/Almaty`).

## Тексты (решения Д5, А5)
- Тексты интерфейса — **только** из `content/messages/kk.json` и `ru.json`. Не копировать в `src/`, не переименовывать и не удалять ключи без контент-лида.
- При расхождении текста в макете и в `content/messages` побеждает `content/messages`.
- `pnpm check:messages` должен проходить. Заметки разработчику — `content/CONTENT_REVIEW.md`, раздел 6 (`t.rich`, `\n` → `white-space: pre-line`, `{kind}`, `{hasHosts}`).

## Секреты
- Только в `.env.local` (git-ignored) и в настройках Vercel/GitHub. В репозитории — `.env.example` без значений.
- Секреты и полные телефоны не попадают в коммиты, логи, вывод скриптов, отчёты и сообщения агентов. Агент не создаёт аккаунты и не просит ключи в чат.

## Процесс (план 13)
- Одна фаза — одна ветка `phase/F{N}-…`. Мерж в `main` делает основатель после вердикта архитектора «принято».
- Документы дизайнера, контент-лида и архитектора (`design/`, `content/`, `architecture/`, `docs/DECISIONS.md`, брифы и ревью в `docs/`) коммитятся **в `main`** отдельными коммитами `docs(...)` (например, `docs(design): …`). В ветке фазы — только код фазы и её handover; после такого коммита ветку фазы перебазировать: `git rebase main` (ревью Ф0, раздел 4).
- Сдача фазы — `docs/phases/Ф{N}-handover.md` по плану 13.5 (с реальным выводом команд); перед сдачей — самопроверка по чек-листу 13.6.
- **Любое отклонение от брифа или плана** (новая зависимость, другой подход, перенос задачи) — в раздел «Отклонения» handover. Молча не отклоняться.
- Не писать код «на будущее» из следующих фаз.

## Команды
`pnpm dev` · `pnpm build` · `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm test:e2e` · `pnpm check:messages` · `pnpm db:generate` · `pnpm db:migrate` · `pnpm sms:test`

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
