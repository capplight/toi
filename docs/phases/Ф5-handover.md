# Ф5 · Приглашение и ответ гостя — пакет сдачи

Версия 1.0 · 2026-10-11 · full-stack разработчик (агент) → архитектор
Бриф: `docs/phases/Ф5-brief.md` v1.0. План v1.8: 1.3, 2, 4.4, 6.4, 7.2, 9, 10, 12.3 Ф5. Дизайн: `DESIGN_v2.md` 6.1, 7, 8.17, 10–12; макеты `05–07-invite-*.html`.

**Статус:** локальная часть брифа сделана; критерии 1–8 проверены локально (раздел 7). Ждут аккаунтов — раздел 9.

---

## 1. Ссылки

| Что | Где |
|---|---|
| Ветка | `phase/F5-invitation` от `phase/F3-event-members` (после правок Ф3 `6fb0259`, `4b3d4d7`). Remote нет |
| Страница гостя | `/i/{token}` (GET — страница, POST — ответ), `/api/i/{token}/ping`, `/i/{token}/opengraph-image` |
| Музыка и файлы | `/api/upload/{key}` (локальный подписанный PUT), `/api/files/{key}` (отдача с `Range`), `/api/media/finalize` |
| Предпросмотр | мастер (`/e/new`, справа в рамке телефона; «Көру» на шаге шаблона), настройки (`/e/{id}/settings`) |
| Скриншоты | `docs/phases/F5-screens/` (78 файлов) |
| Lighthouse | `docs/phases/F5-lighthouse/guest-page.report.{html,json}`, бюджет `lighthouse-budget.json` |

## 2. Спайк дня 1 — route handler и HTML

| Вариант | Результат |
|---|---|
| `import { renderToStaticMarkup } from "react-dom/server"` в `src/app/i/[token]/route.ts` | **Сборка падает.** Turbopack: «You're importing a component that imports react-dom/server…» (Next запрещает его в слое React Server Components, куда попадают route handlers) |
| `react-dom/server.node` | Сборка падает: «Export renderToStaticMarkup doesn't exist in target module» (сборка под условием `react-server`) |
| `createRequire(import.meta.url)("react-dom/server")` во время выполнения | **Работает в standalone:** `curl /i/abc` → `<!doctype html><html lang="kk"><head></head><body><h1>spike abc &lt;&amp;&gt;</h1></body></html>` |

**Решение — запасной путь брифа: тегированные строки с обязательным экранированием** (`src/server/invite/html.ts`).
- Обход через `createRequire` зависит от того, как бандлер обращается с `react-dom`, и может сломаться при обновлении Next.
- Статичная графика дизайнера (SVG-орнаменты, подкладка конверта, обложка арки) в TSX потребовала бы `dangerouslySetInnerHTML`.

Как устроено:
- `html\`…\`` экранирует каждую подстановку, кроме `SafeHtml`. `SafeHtml` даёт только сам `html` или `raw()` для статичных ресурсов и наших констант; пользовательские данные в `raw()` не попадают.
- Статика — 1:1 из макетов: `scripts/build-invite-assets.ts` вырезает фрагменты из `design/v2/mockups/05–07` и `css/invite.css` и пишет `src/server/invite/assets.generated.ts`. Файл генерируется, руками не правится; после изменений макетов команда запускается заново.

## 3. Что сделано

### 3.1 Страница гостя `/i/{token}` — `src/app/i/[token]/route.ts`, `src/server/invite/{render,guest,island}.ts`
- **Состояния 8.17 для трёх шаблонов** («Ақ шаңырақ», «Көк түн» — с полной луной, «Қызғалдақ»):
  1. конверт: «Сізге тойға шақыру келді», имя семьи как ввели, печать с монограммой «А/Д» из `events.title`;
  2. открытие G5–G12 — CSS макета;
  3. приглашение:
     - обложка-заставка SVG;
     - имена «Айбек / пен / Дана»;
     - «Құрметті {familyName}!»;
     - текст kk или ru; при ru без текста — kk-текст и пометка `invite.noRuText` (Д4/10);
     - дата «Жексенбі · 15 · қараша · 18:00» и «Тойға N күн қалды», ертең / бүгін / өтті по календарю Алматы;
     - ресторан и «Картаны ашу»;
     - «Той иелері» — только если `hosts_line` не пуст;
  4. форма ответа;
  5. «Рақмет» / «Хабарлағаныңызға рақмет» с «Жауапты өзгерту»;
  6. ответ закрыт (`invite.closed`);
  7. ошибка под кнопкой (`networkError` / `seatsInvalid` / `rateLimited`).
  - Поля с декором от 900 px — из CSS макета.
- **Без React-рантайма.** Весь JS — встроенный островок `ISLAND_JS` (3,3 КБ, CSP nonce):
  - открытие конверта и cookie «конверт открыт»;
  - музыка: `play()` строго в обработчике «Ашу»; ленивая загрузка после `load` + `requestIdleCallback`; кнопка звука с `aria-pressed`; пауза в фоне;
  - −/+; при «Келе алмаймыз» число мест скрыто;
  - отправка `fetch` с `Accept: application/json`, при ошибке — сообщение под кнопкой;
  - `sendBeacon` для `opened` / `envelope`;
  - пауза бесконечных анимаций вне экрана (`IntersectionObserver`);
  - `html.lite` при reduced motion или на слабом устройстве (≤ 4 ядер и ≤ 2 ГБ).
- **Без JS:**
  - `<noscript>` скрывает сцену;
  - форма — обычный POST → 303 на `?answered=1#rsvp`;
  - язык ҚАЗ | РУС — ссылки `?lang=`, которые ставят cookie `locale`.
- **Повторный визит** (ответ уже есть или cookie «открыт») — сразу приглашение без сцены.
- **Заголовки:** `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, CSP с nonce (`script-src 'nonce-…'`, `base-uri 'none'`, `object-src 'none'`, `form-action 'self'`).
  - Неизвестный токен → 404 без подробностей.
  - Больше 30 неизвестных токенов в минуту с одного IP → 429.
- **OG-метатеги:** `og.invite.title` с именем семьи, описание `{title} · {date}`, картинка.

### 3.2 Ответ гостя — `answerAsGuest`
- Запись идёт через `withSeating` (Ф4):
  - `actor {kind: 'guest', memberId: null}`, `action: 'answer'`, `record: true`;
  - `summary { by: 'guest', from, to }` той же формы, что у ответа по телефону;
  - движок `setRsvp`: рассаженные не двигаются, «Келе алмаймыз» освобождает место;
  - `answered_by = 'guest'`, `responded_at`.
- Лимит — 10 ответов в час на токен.
- Места 1–20 (Д4/13).
- После `rsvp_closes_at` → `closed` (HTTP 409). По умолчанию срок — начало дня тоя по Алматы.
- Согласие: флаг `FEATURE_GUEST_CONSENT=1` (Р10). Галочка `invite.rsvp.consent` с ссылкой; без неё ответ не принимается; пишется `rsvp_consent_at`.

### 3.3 OG-картинка — `src/app/i/[token]/opengraph-image.tsx`
1200×630, фон и цвета шаблона, шаңырақ SVG, «Құрметті {familyName}!» (Cormorant), «{title} · {date}» (Onest). `Cache-Control: public, max-age=86400`. Satori не читает WOFF2, поэтому шрифты — те же подмножества в WOFF (`src/server/invite/fonts/`, сконвертированы `fontTools`), подключены через `outputFileTracingIncludes`.

### 3.4 Хранилище и музыка
- **Интерфейс `src/server/storage/index.ts`** (для Ф8 и переезда в KZ):

  ```ts
  interface Storage {
    driver: "local" | "s3";
    putUrl(key, mime, bytes): Promise<{ url; method: "PUT"; headers; expiresAt }>; // 5 минут
    getUrl(key): Promise<string>;      // local: /api/files/{key}; s3: presigned GET (7 дней)
    read(key): Promise<Buffer>;
    write(key, data, mime): Promise<void>;
    size(key): Promise<number | null>;
    remove(key): Promise<void>;
  }
  storage(): Storage                  // по STORAGE_DRIVER (local по умолчанию | s3)
  ```

  - Ключи — `[a-z0-9/_.-]` без `..`.
  - **Local:** папка `LOCAL_STORAGE_DIR` (`.data/uploads`, в `.gitignore`). PUT подписан HMAC (ключ + mime + максимальный размер + срок 5 минут); отдача с `Range` и `immutable`.
  - **S3:** `@aws-sdk/client-s3` + presigner, `forcePathStyle`. Код приложения знает только интерфейс. **Драйвер S3 не проверен** — ждёт R2.
- **Музыка** (`src/server/media/music.ts`):
  - `createUploadUrl`: mp3 / m4a / aac ≤ 20 МБ, только хозяин;
  - браузер загружает файл по PUT с прогрессом;
  - `POST /api/media/finalize` (`maxDuration` 60 с), `ffmpeg-static`: первые 90 с, MP3 96 кбит/с, стерео 44,1 кГц, затухание 3 с. Результат ≈ 1,1 МБ, ключ с хэшем содержимого;
  - `media_assets`: `uploaded → processing → ready | failed`;
  - битый файл → `failed` и сообщение `wizard.music.failed`.
- **В мастере** события ещё нет, поэтому загрузка — черновик пользователя: `event_id` пуст, ключ `music/u-{userId}/…`. `createEvent` прикрепляет его (`attachDraftMusic` проверяет владельца по ключу).
  - Пока файл загружается или обрабатывается, «Жалғастыру» ждёт.
- **Компонент** `src/ui/components/MusicUpload.tsx` — состояния `#music`, `#music-up` (процент), `#music-proc`, `#music-ready` (плеер 30 с, «Басқасын жүктеу», «Алып тастау»), `#music-error`. Используется в мастере и в настройках (`SettingsMusic`).

### 3.5 Предпросмотр и мелочи прошлых фаз
- **Настоящий предпросмотр.** `previewInviteAction` и `renderPreview` строят HTML того же шаблона по черновым данным и показывают его в `<iframe srcdoc sandbox="">` (без скриптов, форм и переходов).
  - Мастер: справа в рамке телефона, обновляется через 400 мс после изменения; «Көру» на шаге шаблона открывает полноэкранный предпросмотр.
  - Настройки: предпросмотр события и раздел «Шақыру» с музыкой.
- **Мини-конверт «Шақыру қалай барады?»** в правой колонке S2 (отклонение 4 ревью Ф4): имя на конверте — то, что вводится в поле.
- **Сид:** у демо-события шаблон «Ақ шаңырақ», готовые тексты kk/ru из `content/invitation-presets.json`, хозяева, адрес, карта.

## 4. Изменённые файлы и зависимости

- Новые:
  - `src/app/i/[token]/{route.ts,opengraph-image.tsx}`;
  - `src/app/api/{i/[token]/ping,upload/[...key],files/[...key],media/finalize}/route.ts`;
  - `src/server/invite/{html,render,guest,island,preview,assets.generated}.ts` и `src/server/invite/fonts/*.woff`;
  - `src/server/storage/index.ts`, `src/server/media/music.ts`, `src/domain/invitations/dates.ts`;
  - `src/ui/components/MusicUpload.tsx`, `src/app/e/new/InvitePreview.tsx`, `src/app/e/[eventId]/settings/SettingsMusic.tsx`;
  - `scripts/build-invite-assets.ts`, `public/fonts/*.woff2` (копии подмножеств Ф1);
  - `lighthouse-budget.json`;
  - тесты `tests/unit/invite.test.ts`, `tests/integration/invite.test.ts`, `tests/e2e/{invite,music,screens-f5}.spec.ts`.
- Изменены:
  - `Wizard.tsx` (музыка, предпросмотр, «Көру»);
  - `settings/page.tsx`, `GuestForm.tsx` (мини-конверт);
  - `actions/events.ts` (`musicAssetId`, музыка, предпросмотр);
  - `env.ts` + `.env.example` (`STORAGE_DRIVER`, `LOCAL_STORAGE_DIR`, `FEATURE_GUEST_CONSENT`);
  - `next.config.ts` (`serverExternalPackages: ffmpeg-static`, `outputFileTracingIncludes`);
  - `components.css` / `tokens.css` (загрузка музыки, рамка предпросмотра, мини-конверт);
  - `scripts/lib/seed-sample.ts`, `tests/e2e/global-setup.ts` (токены гостей для e2e);
  - `.gitignore` (`.data/`), `.prettierignore` (сгенерированный файл).
- **Новые зависимости** (по брифу): `ffmpeg-static`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`. В `pnpm-workspace.yaml` разрешена сборка `ffmpeg-static: true` (скачивает бинарник при установке).
- На машине разработчика: `pip install --user brotli` — для одноразовой конвертации WOFF2 → WOFF (`fontTools`). В проект не входит.

## 5. Проверки — реальный вывод
```
$ pnpm check:messages
check:messages: OK — 778 keys, kk/ru: ICU, variables, tags, select/other, ru plural forms
check:presets: OK — 16 texts, 6 kinds × kk/ru, no samples, variables or markup
$ pnpm typecheck && pnpm lint && pnpm format:check
✓ Types generated successfully · eslint --max-warnings=0 (0) · All matched files use Prettier code style!
$ pnpm test
      Tests  167 passed (167)              (+6 tests/unit/invite.test.ts)
$ pnpm test:integration                    (PGlite)
 Test Files  9 passed | 1 skipped (10)
      Tests  97 passed | 2 skipped (99)    (+9 tests/integration/invite.test.ts: ответ через адаптер, срок, лимиты, 404, пинги, XSS, ffmpeg)
$ E2E_CHANNEL=chrome DATABASE_URL=…PGlite… pnpm test:e2e --workers=1   (весь набор)
guest page: 4 requests, 92 KB transferred before music; inline JS 3295 B
  2 failed · 16 skipped · 132 passed (10.1m)
  failed 1: guests.spec «дубль по имени» (desktop) — семья «Ерлан ағай отбасы» попала в набор семей Ф5 и получила «Келе алмаймыз»;
            исправлено: семьи, на которые опираются тесты Ф4, исключены из набора Ф5 (global-setup)
  failed 2: guests-perf (S1 < 1 с при CPU ×4) — см. ниже
$ … pnpm test:e2e tests/e2e/invite.spec.ts tests/e2e/guests.spec.ts --workers=1   (после исправления)
  32 passed (2.8m)
$ … pnpm test:e2e tests/e2e/music.spec.ts  → 1 passed (desktop; mobile пропущен — одна загрузка на прогон)
$ SCREENSHOTS=1 … tests/e2e/screens-f5.spec.ts --project=desktop --workers=1  → 1 passed (2.6m), 78 файлов
$ pnpm dlx lighthouse@12.6.1 http://localhost:3100/i/<token> --form-factor=mobile --throttling-method=simulate (standalone)
performance 92 · accessibility 98 · best-practices 100 · LCP 1.6 s · CLS 0 · TBT 280 ms · 108 KiB
$ gitleaks protect --staged
INF no leaks found
```

**Производительность Ф4 в этой сессии.** Тест `guests-perf` не проходит ни отдельно (медиана 3,5–3,7 с), ни в наборе. Причина — в состоянии машины, а не в Ф5. Замеры в этой сессии одним и тем же скриптом:

| Страница | CPU ×4, сейчас | CPU ×4, Ф4 (раньше) | без замедления, сейчас | без замедления, Ф4 |
|---|---|---|---|---|
| «Зал» (только каркас) | 1,2–1,4 с | 0,26–0,40 с | — | — |
| S1 (65 семей) | 4,0–5,1 с | 0,6–0,9 с | 0,14–0,6 с | 0,09–0,17 с |

Профиль Chrome под замедлением: «(program)» 4,1 с против 0,34 с раньше на том же коде. Без замедления цифры прежние, а «Зал» замедлился так же, как S1. Значит, медленнее стал сам браузер и CPU на этой машине (загрузка процессора 3–5 %, лишних headless Chrome нет). Ф5 меняет на этих экранах только +2,7 КБ сообщений `wizard` в клиенте. Нужен замер в CI (Linux), как и требовало ревью Ф4.

## 6. Скриншоты — `docs/phases/F5-screens/`

Имена `G{N}-{состояние}_{шаблон}_{ширина}_{язык}.png`. Сравнивать с `design/v2/screenshots/05/06/07-invite-*` (`_360`, `_1440`, `_open_*`, `_answered_360`, `_mid_360`).

| Состояние | Файлы |
|---|---|
| 1 Конверт | `G1-envelope_*`, `G1-envelope_*_360_kk_130` |
| 3 Приглашение | `G3-invitation_*` (первый экран), `G3-invitation_*_360_*_full` |
| 4 Форма | `G4-form_*`, `G4-form_*_360_kk_130` |
| 5 Ответ отправлен | `G5-answered_*` |
| 6 Ответ закрыт | `G6-closed_*_kk` |
| 7 Ошибка (без JS, число мест вне диапазона) | `G7-error_*` |

Полностраничные снимки сняты со стилем, который отключает появление при прокрутке (`animation-timeline: view()`), иначе нижние секции на снимке пустые. Это особенность съёмки, не страницы. Открытие (2) — анимация, на снимке не показывается; проверено e2e.

## 7. Критерии приёмки

| # | Критерий | Статус |
|---|---|---|
| 1 | Без React-рантайма; JS ≤ 15 КБ gzip; всё до музыки ≤ 150 КБ; ответ без JS | ✅ e2e: внешних скриптов нет, встроенный JS 3,3 КБ (без сжатия), 4 запроса и 92 КБ до музыки (размер без сжатия); ответ с `javaScriptEnabled: false` |
| 2 | Lighthouse mobile ≥ 90, LCP ≤ 2,5 с | ✅ локально по standalone, Chrome headless, mobile, simulate (≈ Slow 4G, CPU ×4): **Performance 92**, Accessibility 98, Best Practices 100, LCP 1,6 с, CLS 0, TBT 280 мс, 108 КБ. В CI и на preview — после аккаунтов |
| 3 | Три шаблона и все состояния; reduced motion, `lite`, пауза анимаций | ✅ скриншоты (раздел 6); e2e: `lite` при reduced motion, axe на конверте и приглашении, 130 % без горизонтальной прокрутки |
| 4 | Ответ через адаптер, виден составителю сразу и в истории; изменение до `rsvp_closes_at` | ✅ integration (версия, история `actor_kind = guest`, `from → to`, рассаженные на месте, 409 после срока) + e2e (ответ гостя виден на S1 в списке составителя; «Жауапты өзгерту») |
| 5 | Музыка: загрузка, обработка, плеер в мастере и настройках; на странице — только по «Ашу» | ✅ integration (`finalizeUpload`: 90 с, ≈ 1,1 МБ, ключ с хэшем, черновик прикрепляется) + e2e (мастер → «Музыка дайын» → событие с музыкой → настройки) |
| 6 | OG ≤ 300 КБ с именем семьи; метатеги | ✅ e2e (`image/png`, < 300 КБ) + метатеги в HTML |
| 7 | Предпросмотр в мастере — настоящий шаблон | ✅ e2e (`srcdoc` содержит название, нет `<script>`) |
| 8 | Тексты только из `content/messages`; без склонений; проверки зелёные | ✅ раздел 5 (исключение — образец имени семьи в предпросмотре из `guestForm.name.placeholder`) |

## 8. Отклонения

1. **Шаблоны — тегированные строки вместо TSX** — по итогу спайка (раздел 2), запасной путь брифа.
2. **Статичная графика генерируется из макетов** (`assets.generated.ts`), а не переписывается руками. Изменения дизайнера в макетах подхватываются командой `pnpm tsx scripts/build-invite-assets.ts`.
3. **Переключатель языка — ссылки `?lang=`**, а не кнопки: так он работает без JS (cookie `locale` ставит сервер). Вид как в макете (`aria-current`).
4. **Обработка музыки — route `/api/media/finalize`**, а не Server Action: синхронная обработка с `maxDuration` 60 с.
5. **Музыка в мастере — черновик пользователя** (`event_id` пуст), потому что событие создаётся только в конце мастера (Ф3). Плановое `createUploadUrl(eventId…)` для существующего события тоже работает (настройки).
6. **Ключ обработанного файла — хэш содержимого + 8 символов `assetId`.** `media_assets.storage_key` уникален: одна и та же песня, загруженная дважды, иначе давала конфликт.
7. **Предпросмотр без конверта и формы:** открытое приглашение в `sandbox` без скриптов; «Көру» — тот же HTML на весь экран. Имя семьи в предпросмотре — образец из `guestForm.name.placeholder`.
8. **Ширина 320 для страницы гостя** проверена только скриншотами 360 и 130 %. Отдельного e2e-проекта 320 для `/i/` нет (проект `small` гоняет только `ui.spec`).
9. **`scripts/optimize-covers.ts` не сделан:** ИИ-обложек ещё нет (Р13). В арке — SVG-заставки шаблонов из макетов.
10. **Lighthouse запущен через `pnpm dlx lighthouse@12.6.1`** с установленным Chrome, без `@lhci/cli` в зависимостях. Бюджет — `lighthouse-budget.json`. Для CI — подключить `@lhci/cli` вместе с GitHub.
11. **Небольшие правки CSS сверх макета** (`EXTRA_CSS` в `render.ts`):
    - строка ошибки;
    - ссылки языка;
    - карточка «закрыто»;
    - режим предпросмотра;
    - боковой декор рисуется и при открытии по «Ашу» — в макете он рисовался только в состоянии `#open`;
    - в reduced motion после открытия появление при прокрутке выключено (иначе axe находил низкий контраст у текста в середине анимации).

## 9. Что ждёт аккаунтов
- Драйвер **S3/R2**: загрузка и отдача, CORS бакета для PUT с домена.
- **ffmpeg на Vercel**: размер функции с бинарником и время (запасной путь — без перекодирования при файле ≤ 3 МБ, ещё не сделан).
- Lighthouse в **CI** и на **preview**.
- Превью ссылки в **WhatsApp** на Android и iOS (`toi-pilot.vercel.app`).
- Звук во **встроенном браузере WhatsApp на iOS**, 3D-конверт на недорогом Android (N5).
- **ИИ-обложки** от основателя → `optimize-covers`.

## 10. Самопроверка (13.6)
- [x] Страница гостя без React, JS — островок с nonce; все данные экранируются (unit/integration на XSS в имени).
- [x] Ответ — только через адаптер Ф4; лимиты и срок проверены.
- [x] Хранилище — только через интерфейс; локальный драйвер проверен e2e и integration.
- [x] Тексты из `content/messages`; имена не склоняются (имя семьи и `events.title` как ввели).
- [x] Серверы, запущенные для проверок, остановлены.
- [ ] Preview / CI / реальные телефоны — ждут аккаунтов.

## 11. Правки по ревью (`docs/phases/Ф5-review.md`, вердикт «нужны правки»)

Цепочка перебазирована на `main` (`62b26d8`, план v1.9). Конфликтов нет.

### П1 — локальное хранилище не включается на Vercel и в проде
- `src/server/env.ts`: при `VERCEL=1` или `APP_ENV=production` нужен `STORAGE_DRIVER=s3`, иначе `EnvError` при старте. Полный набор `S3_*` для `s3` проверялся и раньше.
- `/api/upload/[...key]` и `/api/files/[...key]` первым делом отвечают **404**, если активный драйвер не `local`.
- Тесты:
  - `tests/unit/env.test.ts` — Vercel без `s3` → ошибка; production без `s3` → ошибка; `s3` без ключей → ошибка; `s3` с полной конфигурацией → ок; локально `local` → ок;
  - `tests/unit/storage-routes.test.ts` (новый) — при `STORAGE_DRIVER=s3` оба маршрута отвечают 404.

### П2 — полный последовательный прогон e2e
Два полных прогона (`--workers=1`, mobile + desktop + small) после исправления тестовых данных:
```
$ E2E_CHANNEL=chrome DATABASE_URL=…PGlite… pnpm exec playwright test --workers=1
# прогон 1 (сразу после правок П1/П3 и калибровки)
  1 failed · 16 skipped · 136 passed (10.6m)
  failed: guests-perf (mobile) — Test timeout of 30000ms exceeded: калибровка добавила 4 загрузки при CPU ×4,
          и тест не уложился в 30 с по умолчанию. Исправлено: test.setTimeout(180_000).
          Тот же прогон запускал новый invite-small и в mobile/desktop — исправлено (testIgnore, см. «320 px»).
# прогон 2 (итоговый, после всех правок, включая Н1/Н2)
S1 interactive (CPU ×4): first uncached 4407 ms; warm runs 2860, 4287, 5427, 7960, 8727 ms; frame «Зал» 1065 ms; S1/frame 5.10 — machine overloaded, not asserted
  16 skipped · 135 passed (10.7m)
```
- 16 пропусков — те же, что раньше: скриншоты без `SCREENSHOTS=1`, проверки только для одного проекта (perf и музыка только на mobile/desktop и т. п.).
- `guests-perf` в итоговом прогоне **не падает, но и не проверяет**: каркас «Зал» 1065 мс > 0,5 с, значит, машина перегружена. Цифры только записаны.
- Замечание: тёплые замеры S1 растут от прогона к прогону внутри теста (2,9 → 8,7 с). На «Зал» такого роста нет. Возможно, это накопление в той же вкладке под `setCPUThrottlingRate`. Проверить на CI (Linux) и на реальном Android в РА.

### П3 — уборка музыки по крону
- `src/server/cleanup.ts`, `cleanupMusic(db, now)`. Вызывается из `cleanup()`, поэтому работает в ежедневном `/api/cron/cleanup`. Ответ крона теперь содержит `deleted.music`.
- Удаляются `media_assets` вида `music` **старше 24 ч**, если выполнено хотя бы одно условие:
  - нет события (черновик мастера);
  - `status = 'failed'`;
  - ни одно событие на запись не ссылается (`events.music_asset_id`) — то есть музыка заменена или убрана.
- Удаляются и строки, и файлы в хранилище (`storage().remove`; ошибка удаления файла не останавливает уборку).
- Integration (`tests/integration/invite.test.ts`, локальный драйвер):
  - удаляются: старый черновик, старый `failed`, старый заменённый трек — строки и файлы;
  - остаются: текущий трек события и свежий черновик (< 24 ч).
- `tests/integration/cleanup.test.ts` обновлён (`music: 0` в ответе).

### Калибровка теста производительности (ревью, раздел 4.1)
`tests/e2e/guests-perf.spec.ts`:
- сначала прогрев «Зал», затем медиана трёх замеров каркаса «Зал» (гидратация `.tab`) при том же CPU ×4;
- в журнал пишутся каркас и отношение S1 / каркас;
- если каркас > 500 мс **и это не CI**, тест получает аннотацию `machine overloaded`, цифры только записываются;
- в CI (`CI=1`) проверка `< 1000 мс` строгая, как раньше.

### 320 px для страницы гостя (отклонение 8 → РА; сделано сейчас, это было дёшево)
- `tests/e2e/invite-small.spec.ts` в проекте `small` (320×640). Сценарий: конверт → «Ашу» → приглашение → форма; затем 130 %.
- Проверки: нет горизонтальной прокрутки; все видимые кнопки, ссылки и поля чисел ≥ 48 px (сцена конверта и форма).
- **Отклонение от формулировки ревью:** не весь `invite.spec` в `small`, а отдельный файл, который только читает страницу. Причина: `invite.spec` отвечает за семьи из общего набора (mobile 0–9, desktop 10–19), а третий проект потребовал бы ещё 10 семей и дублировал бы сценарии ответа. В mobile и desktop этот файл исключён (`testIgnore`).
- Итог: 1 passed в обоих полных прогонах.

### Конвертация шрифтов OG — повторяемый скрипт
- `scripts/convert-og-fonts.py`: `public/fonts/*.woff2` → `src/server/invite/fonts/*.woff`.
- Команды:
  - `python -m pip install --user fonttools==4.66.1 brotli`
  - `python scripts/convert-og-fonts.py`
- Проверено с fontTools 4.66.1 и brotli 1.2.0.
- `recalcTimestamp=False`: два запуска подряд дают одинаковые байты. Файлы в репозитории пересобраны скриптом. От прежних они отличаются **только** полем `head.modified` (сравнение таблиц через fontTools).
- **Записанная установка системных пакетов:** `pip install --user brotli` (1.2.0), сделано в Ф5. fontTools 4.66.1 уже был установлен. Других установок нет.

### Неблокирующие
- **Н1 — сделано.** В `answerAsGuest` срок ответа перечитывается из `events` **внутри шага `withSeating`**, то есть под блокировкой события. Если срок прошёл или его передвинули, шаг бросает внутренний сигнал, транзакция откатывается, ответ `closed`.
  - Быстрая проверка до транзакции оставлена: без неё закрытые попытки тратили бы лимит 10/ч.
  - Гонку отдельным тестом не воспроизводили; существующие тесты `closed` проходят.
- **Н2 — сделано.**
  - `finalizeUpload`: не больше **10 обработок в час на пользователя** (`rate_limits`, ключ `music:finalize:{userId}`, константа `FINALIZE_PER_HOUR`). Счёт идёт перед обработкой, повторный вызов для уже готовой записи не считается.
  - `/api/media/finalize` при превышении отвечает **429** `{ ok:false, error:"rateLimited" }`. `MusicUpload` показывает `errors.rateLimited` — новых ключей нет.
  - Integration: 11-я обработка → `rateLimited`, ffmpeg не запускается, запись не уходит в `processing`.
- Н3, Н4 — без изменений (приняты ревью).

### Прочее
- `tests/e2e/global-setup.ts` — только формат Prettier (после перебазирования файл был не отформатирован).

### Проверки после правок
```
$ pnpm check:messages
check:messages: OK — 778 keys, kk/ru: ICU, variables, tags, select/other, ru plural forms
check:presets: OK — 16 texts, 6 kinds × kk/ru, no samples, variables or markup
$ pnpm typecheck && pnpm lint && pnpm format:check
✓ Types generated successfully · eslint --max-warnings=0 (0) · All matched files use Prettier code style!
$ pnpm test
 Test Files  20 passed (20)
      Tests  169 passed (169)          (+2: env П1, storage-routes П1)
$ pnpm test:integration
 Test Files  9 passed | 1 skipped (10)
      Tests  99 passed | 2 skipped (101)   (+2: уборка музыки П3, лимит обработки Н2)
$ pnpm build                           ✓
$ pnpm exec playwright test --workers=1   → 135 passed · 16 skipped (10.7m), см. П2
$ gitleaks protect --staged            → no leaks found
```
