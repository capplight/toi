# Публичный SEO-сайт · handover

Ветка `site/public` (worktree `D:\My Project\toi-site`), от `main` @ 461b259. Не запушено и не смержено.
Основа: `design/SITE_DESIGN.md` + макеты `design/v2/site/*`, контент `content/site/{kk,ru}`, `docs/seo/SEO_PLAN.md` (SEO-02, 04, 05, 06, 07, 08, 13, 16, 17, 18), `docs/seo/CONTENT_PLAN.md`.

## Решения

1. **Маршруты.** Сайт — отдельные корневые layout-ы `src/app/(site)/kk` и `src/app/(site)/ru` (`<html lang>` из URL, а не из cookie), страницы — `[[...slug]]` с `generateStaticParams` по `url` из frontmatter, `dynamicParams = false`, `dynamic = "force-static"`. Приложение переехало в группу `src/app/(app)/…` со своим корневым layout (cookie-язык как был). URL приложения не изменились (группы не входят в URL). Почему так: прежний корневой layout читает cookie → любая страница под ним динамическая, и `<html lang>` нельзя взять из URL; два корневых layout-а — единственный способ сделать сайт статическим (SSG) без изменения приложения.
2. **`/`** — 307 на `/kk` или `/ru`: cookie `locale`, затем `Accept-Language`, иначе `/kk` (SEO_PLAN 5.1, SEO-02; x-default → `/kk`). Временная страница Ф0 удалена (она и была «заменить в Ф1/Ф3»). Вход в приложение не менялся: `/login`, `/e`, `/e/new` (без сессии proxy ведёт на `/login`), `/i`, `/d`, `/join`.
3. **Контент — на этапе сборки.** `src/site/content/parse.ts` (свой лёгкий парсер, без зависимостей; повторяет логику генератора дизайнера `gen_site.py`) + `src/site/content/pages.ts` (индекс страниц, гейт, hreflang-пары). Файлы читаются только при `next build` (все страницы SSG, sitemap/robots — `force-static`); `next.config.ts › outputFileTracingExcludes` убирает `content/site` из standalone-сборки, так что чтение в рантайме упало бы сразу. Проверено: в `.next/standalone` папки `content` нет, e2e сайта зелёные против standalone-сервера.
4. **Один конфиг для основателя — `src/site/config.ts`:** гейт публикации (`hideNeedsFix`, `hideUntilTraditionReview`, `hideWithOpenPlaceholders`, списки `alwaysPublish` / `neverPublish` по URL) и плейсхолдеры (`BRAND: "Той"`, `FREE`, `PRICE`, `REVIEWER`, `EMAIL` …). Смена бренда — одна строка `BRAND`.
5. **Гейт публикации.** Не публикуется страница с `status: needs_fix`, или `needs_tradition_review: true` без подписи (`reviewedBy` без `{…}`), или с незаполненными «жёсткими» плейсхолдерами (`{REVIEWER}`, `{EMAIL}`, `{SUPPORT_WHATSAPP}` …; `{PRICE}`/`{FREE}` не блокируют — рисуются плашкой «жақында / скоро»). Неопубликованная страница открывается по URL, но: `noindex, follow`, нет в sitemap, нет в меню/футере/плитках/«Осы тойға қатысты», ссылки на неё в тексте — обычный текст (`.link-off`), hreflang-пара не ставится, переключатель языка ведёт на ближайший опубликованный хаб. Сейчас опубликовано **25 из 61** (см. «Что нужно от основателя»).
6. **hreflang** — `kk-KZ`, `ru-KZ`, `x-default`→kk, только когда опубликованы обе стороны пары (`hreflang_pair` с любой стороны, симметрично; сборка падает, если пара указывает на несуществующий URL). canonical — на себя.
7. **Базовый URL** для canonical/hreflang/sitemap/OG — `SITE_URL` (новая переменная, добавлена в `.env.example`), иначе `APP_URL`, иначе `http://localhost:3000`. Берётся **при сборке** (страницы статические) — `src/server/env.ts › siteOrigin()` читает только эти две переменные, без проверки всего env.
8. **Пилотный хост остаётся закрытым:** `vercel.json` (X-Robots-Tag noindex на `*.vercel.app`) не тронут; `robots.ts` — прежние правила + `Sitemap:`.
9. **404 (SEO-16)** — `app/global-not-found.tsx` (`experimental.globalNotFound`, нужен из-за нескольких корневых layout-ов). Страница **статическая и двуязычная**: казахский текст и плитки хабов, ниже русский (`lang="ru"`). Определять язык по URL можно только динамически (заголовок из proxy) — а тогда 404 читала бы индекс контента в рантайме; выбрал статику. Статус 404, `noindex`.
10. **Клиентский JS сайта — один островок** `src/site/ui/SiteIsland.tsx` (≈ 2 КБ gzip) с делегированными обработчиками вместо 7 отдельных: «Көшіру» + тост, текст в WhatsApp, фильтр тілек, липкий CTA, подсветка оглавления, закрытие меню (Esc/ссылка), печать, калькулятор столов, cookie `locale` при переключении языка. Без JS всё читается: меню, оглавление, FAQ, обёртка фильтра — `<details>`; WhatsApp-ссылка уже несёт адрес карточки.
11. **CSS** — `src/site/site.css` = `design/v2/site/css/site.css` дизайнера почти без изменений (шрифты через переменные next/font, `body:has(.sticky-cta)` вместо класса, блок «site additions» в конце). Tailwind-утилиты на сайте не используются: так макет переносится 1:1 и сверяется диффом.
12. **Шрифты** — те же подмножества, что в приложении (`src/ui/fonts/*.woff2`, Google Fonts запрещены брифом Ф1), `next/font/local`, `display: swap`; preload только Onest (Cormorant — по месту).
13. **Тексты интерфейса** — `site.*` в `content/messages/{kk,ru,_keys}.json` (≈ 230 ключей), помечены в `content/CONTENT_REVIEW.md` §9 как требующие вычитки. Тексты страниц — из `content/site`.
14. **CTA** «Шақыру жасау / Создать приглашение» → `/e/new` (+ `?kind=` вида тоя страницы, `?template=` у шаблонов; мастер пока эти параметры игнорирует — SEO-14a не делался). Без сессии `/e/new` → `/login` (proxy). CTA из контента (`/login?next=/e/new`, `/e/new?kind=…`) — как написаны.
15. **Демо-приглашение.** В приложении нет `/i/demo`, но есть настоящий рендерер гостевой страницы с режимом предпросмотра (`renderInvite(…, { preview: true })`, его же показывает мастер). Сделано: `/kk/shaqyru/ulgi/{slug}/demo` и `/ru/priglashenie/shablon/{slug}/demo` — статические route handlers, рендерер `/i` с вымышленными данными (`site.demo.*`), без базы, `X-Robots-Tag: noindex`. На страницах шаблонов (T4) — это демо в рамке телефона (`<iframe loading="lazy">`); на остальных страницах блок `DemoInvite` — статичное превью по макету (обложка SVG + имена) и кнопка «Демоны ашу» на T4.
16. **Сноски `<!-- S# -->` не выводятся** (рекомендация дизайнера, вопрос 4: нет таблицы S-ID → пункт списка). Список «Дереккөздер / Источники» из контента выводится в конце статьи (`#src-N`, хост ссылки).
17. **JSON-LD**: `BreadcrumbList` (те же пункты, что видимые крошки), `FAQPage` (только видимые вопросы; `HIDDEN` вырезаны ещё в парсере), `Article` (тілек, дәстүр, функции; `dateModified`/`reviewedBy` — только если во frontmatter есть `updated` / подписанный `reviewedBy`), `Organization` + `WebSite` на главных.
18. **sitemap.xml** — один файл (не индекс по языкам: страниц мало), только опубликованные, `alternates.languages` для пар, `<image:image>` для обложек шаблонов и схемы зала (SEO-18), `lastModified` только из frontmatter `updated` (сейчас его нет ни у одной страницы — поле не выводится).

### Открытые вопросы дизайнера (SITE_DESIGN §8) — приняты рекомендации
| # | Вопрос | Как сделано |
|---|---|---|
| 1 | «Баға / Цены» до Р10 | Пункт меню с плашкой «жақында», страница-заглушка `/kk/baga`, `/ru/tseny` (noindex, не в sitemap) |
| 2 | Знак бренда | Шаңырақ + вордмарк из `config.ts` (`BRAND`), длинный бренд обрезается многоточием |
| 3 | Строки [ВЫЧИТКА] | Заведены как `site.*`, помечены в CONTENT_REVIEW §9 |
| 4 | Сноски `[1]` | Не выводятся; только список источников в конце |
| 5 | «(атасынан)» в метку | Да: парсер выносит в метку `tag from`, при копировании не попадает в текст |
| 6 | ru-поздравления | Копируется только казахский текст; «Как читать» и «Перевод» — под чертой |
| 7 | Крошки на 1-м уровне | Оставлены «Главная › …» для функций и служебных (как в макете рассадки); хабы и главная — без крошек |
| 8 | Первый вопрос FAQ открыт | Нет: все закрыты (меньше сдвиг макета, ответы и так в HTML) |
| 9 | Липкий CTA | Только T1–T3 и T9 (главные, приглашения, функции); на тілек и дәстүр — нет |
| 10 | Рендеры превью 800×1000 | Пока SVG-обложки дизайнера (`/public/site/toiga-shaqyru-*.svg`, имена латиницей); WebP-рендеры — за основателем/дизайнером |

## Что сделано
- Все 59 страниц `content/site` + 2 заглушки цен, 10 шаблонов T1–T10 (`src/site/ui/templates.tsx`), компоненты §3–4 (`chrome.tsx`, `blocks.tsx`): шапка, мобильное меню на `<details>`, переключатель ҚАЗ/РУС (ссылки на пару + cookie), крошки, футер, карточка тілек (метки длины/өлең/бата/халық батасы/«кімнен», Көшіру + тост, WhatsApp), фильтр тілек (кімге/түрі + ұзындығы + бөлімдер), тексты приглашений с `[есімі]`-полями и двуязычной строкой, демо и галерея шаблонов, «Біздің кеңес», «Халық аузынан» (по маркеру `folk`), таблицы с прокруткой внутри, FAQ-аккордеон, оглавление (телефон — `<details>`, десктоп — рейка с подсветкой и мини-CTA), источники, «Мәтінді тексерген», CTA-ряд и баннер, плитки с «жақында», «Осы тойға қатысты» по кластерам вида тоя (`src/site/nav.ts`), схема зала, скриншот «Зал», калькулятор столов, кнопка печати, 404.
- SEO: metadata (title с суффиксом бренда, description, canonical, hreflang, OG), robots meta по гейту, JSON-LD, sitemap.xml, robots.txt + Sitemap.
- Тесты: `tests/unit/site-parse.test.ts` (парсер, маркеры, HIDDEN, гейт, пары), `tests/e2e/site.spec.ts`; `tests/e2e/smoke.spec.ts` обновлён под новый `/`.

## Отклонения
1. **Приложение перенесено в группу `src/app/(app)/`** (git mv, только пути: `globals.css` `@import`, `dev/ui/demo.ts`, `scripts/build-legal.ts`, `.prettierignore`, импорт в `tests/unit/door-flush.test.ts`). При ребейзе других веток git увидит переименования.
2. **`/` больше не временная страница Ф0**, а редирект; три smoke-теста Ф0 про неё заменены двумя (редирект kk/ru + `html[lang]`), тест «временный переключатель» удалён вместе со страницей.
3. **`next.config.ts`**: `experimental.globalNotFound: true` (404 при нескольких корневых layout-ах) и `outputFileTracingExcludes` для `content/site`. `src/proxy.ts` не менялся.
4. Нет MDX (SEO-07 предлагал `.mdx`): контент остался `.md`, свой парсер под маркеры — без новых зависимостей.
5. Компоненты без маркеров в контенте (SITE_DESIGN §6.3: «Деректер әртүрлі», факт-плашка «2024», цитата с `cite`, словарь «Мақаладағы сөздер», «Отырғызу реті») **не сделаны**: дизайнер собирал их вручную `TRANSFORMS`; нужны маркеры от контент-лида. Сейчас эти места — обычные абзацы.
6. Фильтр «Кімге, кімнен»: чипы строятся из H2 групп автоматически («Балаға арналған сөз» вместо «Балаға» в макете), группы «Қысқа / Өлеңмен / Ақ бата» видны только при «Барлығы». Короткие подписи — когда в контенте появится атрибут `from=`/метка группы.
7. Калькулятор столов без JS показывает пример (150 → 13), но не пересчитывает: страница статическая, серверного GET-расчёта нет.
8. OG-картинки (`next/og`) не делались; `ItemList`, `ImageObject` в JSON-LD — тоже.
9. Демо-форма ответа: рендерер в режиме предпросмотра, кнопки ответа не отправляют и экран «Рақмет» не показывают (SEO-08 хотел «понарошку»). Музыки в демо нет (`musicKey: null`).

## Проверки (реальный вывод, worktree `D:\My Project\toi-site`, 2026-10-26)

```
$ pnpm typecheck
$ next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully                      TYPECHECK_EXIT 0

$ pnpm lint
$ eslint --max-warnings=0                           LINT_EXIT 0

$ pnpm test
 Test Files  30 passed (30)
      Tests  207 passed (207)                       TEST_EXIT 0   (+11 новых: tests/unit/site-parse.test.ts)

$ pnpm check:messages
check:messages: OK — 964 keys, kk/ru: ICU, variables, tags, select/other, ru plural forms
check:legal: OK — 4 pages; WARNING 34 × [ЮРИСТ …] left (drafts)   MSG_EXIT 0

$ pnpm build                                        BUILD_EXIT 0
├   /kk/[[...slug]]
│ ├ ● /kk/bailanys  │ ├ ● /kk/biz-turaly  │ ├ ● /kk/dastur/besik-toi  │ └ ● [+35 more paths]
├   /kk/shaqyru/ulgi/[tpl]/demo   ● ak-shanyraq/demo, kok-tun/demo, qyzgaldak/demo
├ ○ /robots.txt
├   /ru/[[...slug]]   ● /ru/traditsii/betashar … [+20 more paths]
├   /ru/priglashenie/shablon/[tpl]/demo   ● ×3
├ ○ /sitemap.xml
(приложение — ƒ, как раньше)
```
Примечание: `next build` дважды из пяти запусков остановился с `SecurityFatalError: Your version of Next.js is affected by a known security vulnerability … Retry the same command` уже после успешной сборки маршрутов; повтор проходит. Это предупреждение Next 16.4.0, не связано с кодом сайта.

```
$ E2E_PORT=3197 E2E_CHANNEL=chrome npx playwright test tests/e2e/site.spec.ts tests/e2e/smoke.spec.ts --project=mobile --project=desktop
  …
  2 skipped        (/api/health db:ok — нет DATABASE_URL локально, как и раньше)
  40 passed (1.7m)
```
Затронутые переносом (без базы): `legal.spec.ts` + `ui.spec.ts` — 55 passed, 2 skipped, 3 failed по таймауту 30 с в одном тесте `ui.spec.ts › no horizontal scroll at 320…1440` (20 холодных загрузок динамических `/dev/ui`, `/login`, `/join`; при повторе с `--workers=1` — 2 из 3 проектов зелёные, третий снова упёрся в 30 с первым, «холодным» прогоном). Ассерты скролла не падали; считаю это скоростью машины, а не регрессией — прошу проверить своим прогоном.

Вес (standalone, `curl`): `/kk` 119 КБ HTML / 22 КБ gzip; `/kk/tilekter/sundet-toi` 260 / 29 КБ; `/kk/dastur/betashar` 119 / 22 КБ. Над первым экраном 360×740 картинок нет (e2e), LCP — H1. Островок сайта — 1,96 КБ gzip. Горизонтальный скролл 0 при 320/360/1440 на всех проверенных страницах; axe без serious/critical на 7 страницах × 2 проекта.

## Известные ограничения
- **Клиентский JS** на странице сайта ≈ 190 КБ gzip (модульные чанки), из них островок сайта ≈ 2 КБ; основная масса — общий бандл Next + React + **Sentry из `src/instrumentation-client.ts`** (импортируется статически на всех страницах, даже без DSN). Цель SEO_PLAN 5.7 (≤ 90 КБ) без правки инструментации приложения недостижима — предлагаю динамический импорт Sentry только при `NEXT_PUBLIC_SENTRY_DSN` (не делал: это код приложения).
- HTML страниц: 110–260 КБ (gzip 22–30 КБ) — Next вкладывает RSC-данные второй раз; страница с 60 тілек самая тяжёлая.
- canonical/sitemap зависят от `SITE_URL` во время сборки; на текущем пилоте без него будут `APP_URL`.
- Lighthouse не мерил (нужен деплой).

## Что нужно от основателя
1. Решить по гейту: сейчас скрыты все дәстүр (нет подписи проверяющего), хабы `/kk/shaqyru`, `/kk/suraqtar` и др. (`needs_fix`), «О нас / Контакты» (плейсхолдеры). Включить страницу — поправить frontmatter или добавить URL в `alwaysPublish` (`src/site/config.ts`).
2. Бренд → `placeholders.BRAND`; домен → `SITE_URL` в Vercel/CI при сборке.
3. Вычитка `site.*` (CONTENT_REVIEW §9).
4. Маркеры для «Деректер әртүрлі», факта, цитаты, словаря (SITE_DESIGN §6.3) — контент-лиду.
5. Next.js 16.4.0: `next build` при первом запуске остановился с предупреждением об уязвимости (SecurityFatalError) и попросил повторить; повторный запуск прошёл. Рекомендуется обновление Next (`next upgrade`), я его не делал.
