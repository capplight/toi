# Ф1 · UI-кит по новому дизайну — пакет сдачи

Версия 1.0 · 2026-10-10 · full-stack разработчик (агент) → архитектор
Бриф: `docs/phases/Ф1-brief.md` v1.0. Дизайн: `design/DESIGN_v2.md` v2.2, макеты `design/v2/mockups/`. План: 2, 11.1, 12.3 Ф1, 13.5–13.6.

**Статус:** все задачи брифа выполнены. Критерии 1–9 проверены локально (раздел 7). Аккаунты для фазы не нужны.

---

## 1. Ссылки

| Что | Где |
|---|---|
| Ветка | `phase/F1-ui-kit` от `phase/F2-foundation` (после правок Ф2): `a553154` (wip), `cad8ba3` (feat), этот handover. Remote нет |
| Витрина | `/dev/ui` — все компоненты и состояния; переключатель ҚАЗ \| РУС и «reduced motion». `/dev/ui/hall` — демо-экран «Зал» для критерия B1. На продакшене обе отдают 404 |
| Каркас | `/e/{eventId}/guests` · `/hall` · `/summary` · `/budget` · `/settings` (вход как в Ф2: `pnpm db:local --memory` → `pnpm db:migrate` → `pnpm db:seed --links`) |
| Preview | ожидает Vercel (аккаунты Ф0) |

## 2. Что сделано (чек-лист брифа)

### 3.1 Основа
- [x] **`src/ui/tokens.css`**: все токены `design/v2/mockups/css/tokens.css` (цвета 3.1, оттенки категорий 3.2, состояния стульев 3.3, шрифты 3.4, отступы/радиусы/тени/высоты 3.5, кривые и длительности 6) + Tailwind v4 `@theme inline` (`bg-lapis`, `text-ink-2`, `rounded-lg`, `shadow-card`, `font-display` …). **Это единственный файл в `src/ui` с буквальными цветами.** Цвета, которые в CSS макетов стояли прямо в компонентах (`#F5DFAE` у иконки баннера и т. п.), стали именованными токенами (раздел 8, п. 4).
- [x] **`src/ui/components.css`**: классы компонентов перенесены из CSS макетов `tokens.css` и `screens.css` с теми же размерами, но значения берутся из токенов. Тексты — в `rem` (раздел 8, п. 2).
- [x] **Reduced motion** глобально: `@media (prefers-reduced-motion: reduce)` и тот же набор правил для `html.reduce-motion` (переключатель витрины). Без `transform`, анимации ≤ 1 мс, орнаменты сразу нарисованы, без пульса, полоски таймера и спиннера.
- [x] **Шрифты:** `next/font/local` из **копий** подмножеств дизайнера (`src/ui/fonts/*.woff2`, 40,6 КБ). Onest 400/600, Cormorant Garamond 600; Google Fonts нет. Числа — `font-variant-numeric: tabular-nums` (`.num`, `.t-stat`).
- [x] **Иконки:** спрайт `public/icons.svg` (копия из `design/v2/assets/icons`), компонент `Icon` (`aria-hidden`, подпись рядом).
- [x] **Орнаменты:** `scripts/gen-ornaments.mjs` один раз генерирует `src/ui/ornaments/generated.tsx` (Shanyraq, KoshkarMuiz, Divider, Corner, Mark) из SVG дизайнера: `currentColor`, `pathLength="1"`. Анимация «рисования» — классы `.draw` и `.spin-once` (W12: один оборот). Импортов из `design/` в приложении нет (раздел 5.4).

### 3.2 Компоненты — `/dev/ui`, все состояния, kk и ru
Список с путями и props — раздел 4 (контракт для Ф3–Ф8).
- [x] Действия: Button (8 вариантов, pressed/focus/disabled/loading), LanguageSwitch (светлый и на тёмном), EventMenu «⋯», Segment (обычный и компактный в шапке).
- [x] Навигация: Tabs (3), Rail (104), Sidebar (272) — в `AppShell`.
- [x] Ввод: CategoryTiles (Radix RadioGroup), Stepper (64×64, 1–20, подсказка на границе + `vibrate(30)`), Field/PhoneInput (+7, ошибка рядом с полем, `aria-invalid`, `aria-describedby`, `role="alert"`), Search (и вариант помощника 64 px).
- [x] Списки и статусы: GuestCard (все 4 статуса, телефон, «Еске салу» с «3 күн бұрын», «WhatsApp-қа жіберу», строка «WhatsApp ашылды · Жіберілді ме?», `flash`, десктопная строка), StatusBadge, CounterTile (`aria-pressed`), Banner (5 видов), StatusChip (4), SummaryLine (Radix Collapsible, ≤ 56 px), EventHero (компактный N1 и полный), LinkRow, TableAccordion (Radix Accordion, переполнение — красная рамка), ProgressBar, FamilyRow, GroupHead, Skeleton, EmptyState.
- [x] Оверлеи:
  - **Sheet** — Vaul снизу на телефоне, `direction="right"` 480 px на ≥ 1024;
  - **Dialog** — Radix по центру 500 px на ≥ 1024, на телефоне — Vaul;
  - **AlertDialog** — Radix;
  - фокус-ловушка (Vaul/Radix); системная «Назад» закрывает шторку (`useBackToClose`, e2e).
- [x] **Toast** (Sonner) по правилу B1:
  - одна строка ≤ 56 px, многоточие;
  - над вкладками или над главной кнопкой (`Toaster hasCta`);
  - `body.has-toast` даёт нижний отступ области;
  - только один тост (`visibleToasts=1`, предыдущий снимается);
  - 8 с, «Қайтару», пауза при наведении или касании (Sonner).
- [x] `PilotBanner` (`legal.pilotBanner`) — только при `isOwner`; в каркасе подключён к `role = owner`.

### 3.3 Графика зала — `src/ui/hall/HallMap.tsx`
- [x] **TableGraphic** — ячейки 82×86 и 164×140 (две строки подписи, основная категория до 16 символов с «…»). **TableGraphicLarge** — 200×200, стулья блоками по семьям, номер семьи на первом стуле. Геометрия точно по `design_spec` 3.12: R 26/27 и 44/46, c 4,5/4 и 7,5/7, значок r 9/12 со смещением 24/40.
- [x] Состояния 3.3: занят, свободен (колечко), пустой (пунктир), переполнен (кольцо, «!», подпись красным), дубль (кольцо `--dup`, маркер 1/2, стулья семьи, остальные 30 %), кандидат (пунктир success, «N бос»), текущий (кольцо lapis, «қазір»), неподходящий (45 %), выбранный (`--lapis-soft`).
- [x] **HallMap**: одна SVG по 3.13 и DESIGN_v2 9.
  - ТӨР; стол молодых или «Құрметті үстел» через `hall.map.coupleTable` с `{kind}`; КІРЕБЕРІС.
  - 2 и 4 колонны; неполный последний уровень.
  - Ячейка — `role="button"`, `aria-label` = `hall.map.tableA11y` с `{missing}`; стулья `aria-hidden`; Enter/Space.
  - **Данные только из `tableStats` (`@/domain/seating`)**: колонна, уровень, занятость, переполнение, основная категория. Компонент ничего не рассаживает. Отметки дублей и «Ауыстыру» передаёт вызывающий код.
- [x] Проверка: 20 × 16 в 4 колоннах на 328 px — на витрине. На 1440 схема с легендой вписана по высоте (`max(400px, min(600px, (100vh − 250px)·0.68))`).

### 3.4 Каркас экранов
- [x] `/e/[eventId]/layout.tsx` (Ф2 `requireMember`) + `AppShell`:
  - < 768: шапка 60 с «⋯», 3 вкладки; «Шығындар» — карточка на «Қорытынды», только с правом;
  - 768–1279: рейка 104;
  - ≥ 1280: панель 272 с карточкой события и карточкой «Серік · роль · право»;
  - две колонки от 1024 (`.page`/`.aside`).
- [x] Страницы-заглушки `guests`, `hall`, `summary`, `budget` (404 без `can_manage_budget`), `settings` (только хозяин). Заголовки из `content/messages`. `/e/[eventId]` перенаправляет на `guests` (план 11.1).
- [x] **Язык на рабочих экранах — только через «⋯ Той мәзірі»** (Қазақша / Русский, Менің тойларым, Баптаулар для хозяина, Шығу). Видимого ҚАЗ \| РУС в каркасе нет (e2e).
- [x] `/join` (обычный, «жарамсыз», «слишком много попыток») и `/login` (телефон; код: 6 ячеек, одно поле `one-time-code`; таймер «Қайта жіберуге 0:42 қалды»; «Код келмеді ме?» через 60 с или по статусу провайдера; кнопки «Иесінен сілтеме сұрау», «Жаңа код сұрау») перекрашены по макету 09. Ночная плашка, знак, рисующийся шаңырақ, ҚАЗ \| РУС. Логика Ф2 не менялась.
- [x] `/e` — список тоев в новом стиле.

### 3.5 Витрина и проверки
- [x] `/dev/ui` и `/dev/ui/hall` отдают 404 при `VERCEL_ENV=production` или `APP_ENV=production` (`src/app/dev/ui/guard.ts`).
- [x] Playwright: проекты `mobile` 360×740, `small` 320×640 (только UI-проверки), `desktop` 1440×900 — раздел 5.

## 3. Изменённые файлы и зависимости

`git diff --stat phase/F2-foundation...HEAD` без lockfile и скриншотов: **51 file changed, 6325 insertions(+), 197 deletions(-)**. Главное:
```
src/ui/tokens.css · components.css · fonts.ts · fonts/*.woff2 · lib/{cn,hooks}.ts
src/ui/components/{Button,Icon,Controls,Display,Sheet,Toast,AppShell,PilotBanner}.tsx
src/ui/hall/HallMap.tsx · src/ui/ornaments/generated.tsx (сгенерирован)
src/app/e/[eventId]/{layout,EventShell,page}.tsx + guests|hall|summary|budget|settings/page.tsx
src/app/(auth)/{AuthFrame,AuthLanguageSwitch,layout}.tsx, join/[token]/page.tsx, login/{page,LoginForm}.tsx
src/app/e/page.tsx · src/app/dev/ui/{page,Showcase,demo,guard}.tsx · dev/ui/hall/{page,HallDemo}.tsx
public/icons.svg · scripts/gen-ornaments.mjs · eslint.config.mjs (граница src/ui)
tests/e2e/{ui,shell,screens}.spec.ts · global-setup.ts · auth.spec.ts · playwright.config.ts (проект small)
docs/phases/F1-screens/*.png (56 скриншотов, 6,7 МБ)
```

**Новые зависимости** — все ожидались брифом:

| Пакет | Версия | Зачем |
|---|---|---|
| `@radix-ui/react-toggle-group` | 1.1.20 | LanguageSwitch, Segment |
| `@radix-ui/react-radio-group` | 1.4.8 | CategoryTiles |
| `@radix-ui/react-collapsible` | 1.1.21 | SummaryLine |
| `@radix-ui/react-accordion` | 1.2.21 | H2-List |
| `@radix-ui/react-dialog` / `-alert-dialog` | 1.2.0 / 1.1.24 | Dialog, AlertDialog |
| `vaul` | 1.1.2 | Sheet (снизу, справа) |
| `sonner` | 2.0.8 | Toast |
| `class-variance-authority`, `clsx` | 0.7.1, 2.1.1 | варианты Button, классы |
| `@axe-core/playwright` (dev) | 4.13.0 | доступность |

`tailwind-merge` не добавлен: компоненты используют классы из `components.css`, а не наборы утилит, и сливать нечего (раздел 8, п. 3). Motion не подключён — бриф откладывает его на Ф7b.

Новых переменных окружения нет. `/dev/ui` проверяет `VERCEL_ENV` и `APP_ENV`. Миграций нет.

## 4. Контракт компонентов (для Ф3–Ф8)

Все клиентские компоненты берут фиксированные тексты через `useTranslations` (нужен `NextIntlClientProvider` с namespaces `common, nav, meta, legal, hall, guests, guestSheet, summary, budget, errors, roles` — так в `/e/[eventId]/layout.tsx`). Данные приходят в props.

| Компонент | Файл | Props |
|---|---|---|
| `Button`, `ButtonLink`, `buttonVariants` | `src/ui/components/Button.tsx` | `variant: primary\|wa\|secondary\|wa-outline\|danger\|danger-fill\|text\|icon`, `size: default\|row`, `width: full\|auto`, `icon?: IconName`, `loading?`, button attrs; `ButtonLink {href}` |
| `Icon` | `…/Icon.tsx` | `name: IconName` (44 id спрайта), `size: md\|sm\|xs` |
| `LanguageSwitch` | `…/Controls.tsx` | `value: kk\|ru`, `onChange`, `onDark?` — **только** `/join`, `/login`, страница гостя |
| `Segment<T>` | `…/Controls.tsx` | `value`, `onChange`, `options: {value,label,icon?}[]`, `label`, `compact?` |
| `CategoryTiles` | `…/Controls.tsx` | `value`, `onChange`, `options: {id,label,code?}[]`, `label`, `addLabel?`, `onAdd?` |
| `Stepper` | `…/Controls.tsx` | `value`, `onChange`, `min=1`, `max=20`, `label`, `unit`, `limitHint?`, `decreaseLabel`, `increaseLabel` |
| `Field`, `PhoneInput`, `Search` | `…/Controls.tsx` | `label`, `hint?`, `error?`, `prefix?`, `icon?`, input attrs; `Search {label, placeholder, value, onChange, door?}` |
| `GuestCard` | `…/Display.tsx` | `name, status: notSent\|noAnswer\|yes\|no, seats, tableNo, hasPhone?, sentAgo?, pendingConfirm?, flash?, onOpen?, onSend?, onRemind?, onConfirmSent?` |
| `StatusBadge` | `…/Display.tsx` | `status`, `seats?` |
| `CounterTile` | `…/Display.tsx` | `kind: yes\|inv\|no`, `text` (`guests.list.counters.*`), `pressed`, `onToggle` |
| `Banner` | `…/Display.tsx` | `kind: remind\|error\|dup\|view\|unplaced`, `title`, `text?`, `href?`, `onClick?`, `live?` |
| `StatusChip`, `Chips` | `…/Display.tsx` | `kind: error\|dup\|unplaced\|view`, `label`, `a11yLabel`, `onClick?` |
| `SummaryLine` | `…/Display.tsx` | `line`, `restaurant`, `children` (полная сводка), `defaultOpen?` |
| `EventHero` | `…/Display.tsx` | `title`, `kindLabel?`, `dateLine`, `venue?`, `compact?` |
| `LinkRows`, `LinkRow` | `…/Display.tsx` | `title?`; `href, icon, title, subtitle?, count?` |
| `TableAccordion` | `…/Display.tsx` | `items: {id,title,meta,over?,content}[]` |
| `ProgressBar` | `…/Display.tsx` | `value, max, label, tone: lapis\|success\|over` |
| `FamilyRow` | `…/Display.tsx` | `index, name, meta, lockedText?, actions?` |
| `GroupHead`, `Skeleton`, `EmptyState` | `…/Display.tsx` | `{code?, title, count?}`; `{height?}`; `{title, body?, action?}` |
| `Sheet`, `Dialog` | `…/Sheet.tsx` | `open, onOpenChange, title, description?, children, footer?` |
| `AlertDialog` | `…/Sheet.tsx` | `open, onOpenChange, title, description, confirmLabel, cancelLabel?, onConfirm` |
| `Toaster`, `showToast`, `useUndoToast` | `…/Toast.tsx` | `Toaster {hasCta?}` — один на экран; `showToast({message, undoLabel?, onUndo?})` |
| `AppShell`, `EventMenu` | `…/AppShell.tsx` | `event {id,title,dateLine}`, `user {name,roleLabel,permissionLabel,initial}`, `isOwner`, `canManageBudget`, `hallAttention?`, `title`, `topRight?`, `hasCta?`, `actions {setLocale, logout}` (Server Actions передаются из `app/`) |
| `PilotBanner` | `…/PilotBanner.tsx` | `isOwner` |
| `HallMap` | `src/ui/hall/HallMap.tsx` | `stats: HallStats` (из `tableStats`), `columns: 2\|4`, `categoryCodes`, `categoryLabels?`, `eventKind`, `eventTitle`, `selected?`, `marks?: Record<no, {dup?: {marker,seats}, move?: candidate\|current\|unfit}>`, `dimUnmarked?`, `onSelectTable?`, `onSelectCouple?` |
| `TableGraphic`, `TableGraphicLarge`, `HallLegend` | `…/HallMap.tsx` | `{size: cell\|cell2, no, used, capacity, catCode, catLabel?, mark?}`; `{no, capacity, familySeats[], catCode, label}`; — |
| Ornaments | `src/ui/ornaments/generated.tsx` | `Shanyraq`, `KoshkarMuiz`, `Divider`, `Corner`, `Mark` — SVG props |

## 5. Проверки — реальный вывод

### 5.1 Сводка
```
$ pnpm check:messages
check:messages: OK — 757 keys, kk/ru: ICU, variables, tags, select/other, ru plural forms
$ pnpm typecheck
✓ Types generated successfully
$ pnpm lint                      (0 ошибок и предупреждений; граница src/domain и новая граница src/ui)
$ pnpm format:check
All matched files use Prettier code style!
$ pnpm test
 Test Files  16 passed (16)
      Tests  143 passed (143)
$ pnpm test:integration          (PGlite)
 Test Files  6 passed (6)
      Tests  51 passed (51)
$ pnpm build
✓ Compiled successfully   … ƒ /dev/ui · ƒ /dev/ui/hall · ƒ /e/[eventId]/{guests,hall,summary,budget,settings}
$ E2E_CHANNEL=chrome DATABASE_URL=…PGlite… pnpm test:e2e      (standalone, mobile + desktop + small)
  3 skipped
  72 passed (2.7m)
$ gitleaks protect --staged
INF no leaks found
```
Три пропуска: проверка B1 в проекте `desktop` (это критерий телефона) и `screens.spec.ts` без `SCREENSHOTS=1` (×2).

### 5.2 e2e Ф1 — `tests/e2e/ui.spec.ts` (×3 проекта) и `shell.spec.ts` (×2)
- **axe** (`wcag2a/aa`, `wcag21a/aa`) без serious/critical: `/dev/ui`, `/dev/ui/hall`, `/login`, `/join/…`, каркас `/e/{id}/guests` и `/summary`. Заодно проверяется, что в консоли нет `MISSING_MESSAGE` и `FORMATTING_ERROR`.
- **Нет горизонтальной прокрутки** на 320, 360, 768, 1024, 1440: `/dev/ui`, `/dev/ui/hall`, `/login`, `/join`.
- **Цели ≥ 48 px** у всех интерактивных элементов `/dev/ui` (в том числе ячейки схемы и стол молодых на 320 px).
- **130 %:** `html { font-size: 130% }` → размер h1 растёт больше чем в 1,25 раза (тест не может пройти вхолостую), горизонтальной прокрутки нет.
- **Reduced motion** (`emulateMedia`): у `.draw path` `animation-name: none`, `stroke-dashoffset: 0`, transition ≤ 250 мс. Переключатель витрины даёт то же.
- **Критерий B1** на `/dev/ui/hall` (360×740 и 320×640) при всех проблемах сразу:
  - сводка, баннер «… адамға орын жоқ · тағы 1 үстел керек», чипы «2 үстел тығыз» и «Ұқсас: 2»;
  - тост «16-үстелге ауыстырылды: Сапарбаевтар (бас құда) отбасы» обрезан многоточием;
  - видны «ТӨР» и столы 1–4 целиком и выше тоста;
  - тост ≤ 56 px и стоит над вкладками.
- **HallMap:** у ячейки 7 `role="button"` и `aria-label` «7-үстел, 14 адам, 12 орын, 2 орын жетпейді» (из `hall.map.tableA11y`).
- **Sheet:** открывается диалог, системная «Назад» закрывает его, URL не меняется.
- **Toast:** два нажатия — один тост; длинный текст обрезан (scrollWidth > clientWidth); высота ≤ 56.
- **Каркас:**
  - 360: вкладки, 3 пункта, `aria-current`; 800: рейка 104; 1440: панель 272 с карточкой события;
  - «Шығындар»: у хозяина в панели и карточкой на «Қорытынды»; у «Жастар» ссылки нет, а `/budget` → 404;
  - на рабочем экране нет ҚАЗ \| РУС; «⋯ Той мәзірі» → «Русский» → `html[lang=ru]`;
  - пометка «тестовая версия» видна хозяину и не видна «Жастар».

**Найдено и исправлено проверками:**
1. axe: у живого `Banner` стоял `role="status"` на самой кнопке. Теперь кнопку оборачивает область `role="status"`.
2. Цели: поле числа в Stepper было 40 px, стало 48. Стол молодых на 320 px был 47 px — добавлена прозрачная область нажатия.
3. Секции витрины на 320 px раздвигались текстом с `nowrap` (min-content в grid) — `minmax(0,1fr)` и `.sum { min-width: 0 }`.
4. Ошибка телефона показывалась рядом с полем, но не объявлялась экранному чтецу (это поймал e2e Ф2) — `role="alert"` у ошибки поля.
5. **130 % ничего не меняло**: тексты макетов в `px`. Перевёл шрифты в `rem` (100 % — те же пиксели), подписи SVG-схемы оставил в px (раздел 8, п. 2). Тест теперь проверяет, что текст действительно вырос.

### 5.3 e2e Ф2 после перекраски
Зелёные (входят в 72 из 5.1): вход по ссылке хозяина и составителя, по коду, отозванная и мусорная ссылка, `/e` без сессии, чужой → 404. Селекторы — по ролям и текстам. Изменено только ожидание URL после входа: `/e/{id}/guests`.

### 5.4 Grep-проверки критерия 1
```
$ grep -rnE "#[0-9a-fA-F]{3,6}\b" src/ui (кроме tokens.css; без href="#…" спрайта) → пусто
$ grep -rnE "from ['\"].*design/|design/v2" src (код) → только комментарий в Icon.tsx
$ grep -rnE "@/server|drizzle-orm|from \"pg\"" src/ui → пусто (и правило ESLint)
```

## 6. Скриншоты — `docs/phases/F1-screens/` (рядом с дизайном)

Снято `SCREENSHOTS=1 pnpm exec playwright test tests/e2e/screens.spec.ts --project=desktop` на Windows (Chrome). Это не эталоны: шрифты в Linux-CI рендерятся иначе.

| Наш скриншот (kk и ru: `_kk` / `_ru`) | Дизайн (`design/v2/screenshots/`) |
|---|---|
| `hall-demo_360_*.png`, `hall-demo_1440_*.png` | `03-hall_all_360.png`, `03-hall_1440.png` |
| `ui-hallmap_*` (обычный, выбранный 7, дубли, «Ауыстыру», 20×16, 2 колонны) | `03-hall_dup_360.png`, `03-hall_dup_1440.png`, `03-hall_1440.png` |
| `sheet-table7_360_kk.png`, `sheet-table7_1440_kk.png` | `04-table-sheet_360.png`, `04-table-sheet_1440.png` |
| `login_360_*.png`, `login_1440_*.png` | `09-join-login_sms_360.png`, `09-join-login_1440.png` |
| `join-expired_360_*.png`, `join-expired_1440_*.png` | `09-join-login_expired_360.png`, `09-join-login_expired_1440.png` |
| `shell-guests_360_*.png`, `shell-guests_1440_*.png` (каркас без списка — Ф4) | `01-guests_360.png`, `01-guests_1440.png` |
| `event-menu_360_kk.png`, `event-menu_1440_kk.png` | `01-guests_menu_360.png` |
| `ui-guests_*`, `ui-banners_*`, `ui-summary_*`, `ui-inputs_*`, `ui-button_*`, `ui-tables_*` | `01-guests_*`, `02-add-guest_*`, `03-hall_sum_360.png` |
| `hall-demo_360_*_130.png`, `login_360_*_130.png` (текст 130 %) | — |

## 7. Критерии приёмки

| № | Критерий | Статус | Как проверено |
|---|---|---|---|
| 1 | Токены, шрифты, ассеты — только копии в приложении; цветов вне токенов в `src/ui` нет | **выполнен** | 5.4 |
| 2 | Компоненты раздела 7 (кроме Envelope, RSVP, MusicToggle, MiniHallMap, OfflineIndicator) на `/dev/ui` во всех состояниях, kk и ru | **выполнен** (оговорка — раздел 8, п. 9) | `/dev/ui`; скриншоты `ui-*_{kk,ru}`; e2e без `MISSING_MESSAGE` |
| 3 | Каркас в трёх режимах; «Шығындар» скрыт без права; язык только через «⋯» | **выполнен** | `shell.spec.ts` |
| 4 | HallMap рисует сид (16 столов) и 20×16 по `tableStats`; переполнение, дубли, кандидаты — как на скриншотах дизайна; aria из `content/messages` | **выполнен** | `/dev/ui#hallmap`, `ui-hallmap_*`, e2e aria |
| 5 | Toast по правилу B1; критерий B1 на «Зал» (360×740 и 320×640) | **выполнен** | e2e B1 и Toast в проектах `mobile` и `small` |
| 6 | axe без serious/critical; цели ≥ 48; нет горизонтальной прокрутки на 320–1440; reduced motion выключает движение | **выполнен** | 5.2 |
| 7 | `/join`, `/login` в новом стиле; e2e Ф2 зелёные | **выполнен** | 5.3, скриншоты |
| 8 | `/dev/ui` недоступен на продакшене | **выполнен в коде** (`guard.ts`: 404 при `VERCEL_ENV`/`APP_ENV = production`) | на настоящем продакшене проверится после аккаунтов |
| 9 | typecheck, lint, unit, integration, e2e, check:messages — зелёные | **выполнен** | 5.1 |

## 8. Отклонения от брифа и макетов

1. **`/e/[eventId]` → редирект на `/e/[eventId]/guests`** (маршрут плана 11.1). В e2e Ф2 обновлено ожидание URL.
2. **Шрифты в `rem`, а не в `px`, как в CSS макетов** (100 % — те же пиксели). Иначе системный крупный текст (130 %) не увеличивал интерфейс, а это важно для людей 50+. Метки SVG-схемы оставлены в px: это единицы `viewBox` с фиксированной геометрией (design_spec 3.12, метки 14 px). Поэтому на 130 % схема не растёт — она масштабируется по ширине.
3. **Компоненты в стиле shadcn** (код в репозитории, Radix, cva), но вид задают классы `components.css`, перенесённые из макетов «те же размеры, те же токены», а не утилиты Tailwind в JSX. Токены при этом доступны и как утилиты через `@theme`. Поэтому нет `tailwind-merge`.
4. **Новые токены** вместо буквальных цветов, которые в CSS макетов стояли внутри компонентов: `--sand-pressed`, `--night-glow`, `--night-auth`, `--on-night-2`, `--white`, `--remind-icon-bg`, `--error-icon-bg`, `--dup-icon-bg`, `--view-icon-bg`, `--chip-error-border`, `--chip-dup-border`; полупрозрачные (`--disc-stroke`, `--focus-halo`, …); тени кнопок и героя; размеры `--w-rail`, `--w-sidebar`, `--w-panel`, `--w-dialog`, `--h-toast`, `--t-toast`. Значения — ровно из макетов.
5. **EventMenu на ≥ 1024 — Dialog по центру** (DESIGN_v2 7 разрешает «DropdownMenu или Dialog»): одно содержимое на всех ширинах, на телефоне — шторка Vaul.
6. **AlertDialog (удаление) по центру на всех ширинах**, а не шторкой на телефоне: необратимое действие требует явного выбора, фокус сразу на «Бас тарту».
7. **`themeColor: "#f7f2e9"`** (цвет `--ivory`) — в `src/app/layout.tsx`: Next требует для `viewport` литерал. Это за пределами `src/ui`.
8. **Пауза тоста при касании** — штатное поведение Sonner (hover/focus). На реальном телефоне не проверено — проверим вместе с телефонами Ф2.
9. **Состояние `loading` у HallMap** закрыто общим `Skeleton`. Отдельный скелетон схемы сделаем в Ф7b, когда схема будет грузиться с сервера. Точка «Залда назар аударатын жер бар» у вкладки «Зал» в каркасе пока выключена (`hallAttention` — prop): ей нужны данные рассадки, это Ф7b.
10. **Демо «Зал» — 14 столов вместо 16**, чтобы переполнение, дубли и неразмещённые были одновременно. Все числа считает движок Ф7a, захардкоженных нет.
11. **Заголовки секций витрины `/dev/ui`** — технические имена компонентов на латинице. Это внутренний инструмент разработчика, не продукт: на продакшене 404.
12. **GuestCard:** нажимается вся карточка (прозрачная кнопка с `aria-label` = `guests.card.a11y`). Кнопки действий лежат поверх неё и не вложены в неё — вложенных интерактивных элементов нет.
13. **На 360×740 в демо «Зал» видны «ТӨР», стол молодых, ряды 1–2 и часть ряда 3** (дизайн: «ряды 1–2»); на 320×640 — «ТӨР», стол молодых, столы 1–4. Критерий B1 выполнен с запасом.
14. **Новое правило ESLint для `src/ui`** (не импортировать `@/server`, ORM, `pg`): Server Actions передаются в UI через props.
15. **Тестовые сессии в глобальной настройке e2e** (Әкесі и Жастар): они нужны, чтобы проверять каркас без лимитов OTP. Есть только в тестовой базе.

## 9. Запросы контент-лиду

1. **Заголовок подтверждения удаления.** Ключа `guestSheet.delete.title` нет; в AlertDialog заголовком стоит `common.actions.delete` («Өшіру»), а текст — `guestSheet.delete.confirm`. Нужен ли отдельный заголовок — решить до Ф4.
2. **ru `hall.map.tor` = «Төр»** — в макете «ТӨР» заглавными (стиль коротких меток, DESIGN_v2 3.4). Сейчас по А5 выводится строка как есть. Предлагаю ru «ТӨР», если согласны.

Новых ключей не добавлял; на `/dev/ui` всем строкам хватило существующих.

## 10. Самопроверка (13.6)

- [x] Задачи брифа выполнены; отклонения записаны (раздел 8).
- [ ] Проверка на preview URL — ожидает Vercel.
- [x] Структура 11.1: `src/ui` — дизайн-система без сервера и базы (ESLint); `src/domain` не менялся.
- [x] Нет запрещённого по 4.4; новые зависимости — из брифа.
- [x] Тексты только из `content/messages`: в консоли нет `MISSING_MESSAGE`; исключение — технические заголовки `/dev/ui` (п. 11).
- [x] Соответствие макетам: те же токены и размеры (перенос CSS макетов); скриншоты рядом с дизайном (раздел 6).
- [x] Доступность: цели ≥ 48, текст ≥ 16 (кроме меток схемы 14), контраст из токенов (AA проверен дизайнером), aria на SVG-столах и шторках, фокус-ловушки, «Назад», reduced motion; axe без serious/critical.
- [x] `dangerouslySetInnerHTML` нет.
- [x] Все проверки зелёные (раздел 5).
