# Ф7b · Зал и рассадка: интерфейс — пакет сдачи

Версия 1.0 · 2026-10-13 · второй full-stack разработчик (агент) → архитектор
Бриф: `docs/phases/Ф7b-brief.md` v1.0 (ветка `docs/arch-f7b-f8`). План: `architecture/ARCHITECTURE_PLAN.md` v1.9 — 6.5, 7.2–7.6, 12.3 Ф7b, 13.5.
Дизайн: `design/DESIGN_v2.md` 8.6–8.13, 9, 6.2, 17.3 (v2.4); `design_spec.md` 3.12–3.13, 4.10–4.17; макеты `03-hall` (`#list`), `04-table-sheet`, `14-hall-move`, `15-hall-order`, `16-hall-history`.

**Статус:** все задачи брифа сделаны; критерии приёмки выполнены, кроме оговорок раздела 7 (PGlite и «два браузера», Android, preview). Аккаунты не использовались.

---

## 1. Ссылки

| Что | Где |
|---|---|
| Ветка | `phase/F7b-hall` (локально, worktree `D:/My Project/toi-f7b`; remote нет) |
| Основа | от `phase/F6-summary`, перебазирована на `phase/RA-prep` (`0ce3acf`, раздел 10) |
| Preview | нет (GitHub/Vercel ждут основателя) |
| Демо-вход | сид `pnpm db:seed`, номер Әкесі `+7 700 *** ** 01` (console-код) или готовые сессии e2e-миров |
| Скриншоты | `docs/phases/F7b-screens/` (32 файла + варианты H4) |

## 2. Что сделано (чек-лист брифа)

### 2.1 Сервер (`src/server/seating/hall.ts`, `view.ts`, `actions/hall.ts`)
- [x] Действия плана 6.5 через `withSeating`, у каждого своя `action` и `summary`:
  - `moveFamily(familyId, toTableNo, force, familyVersion, reason?)` — `familyVersion` проверяется под блокировкой события → `{conflict: "moved", tableNo, memberLabel}` (409, тост `hall.map.moveConflict`); `move_overflow` без `force` → `{overflow: {missing}}`, ничего не пишется, версия не растёт («Бәрібір ауыстыру»); перенос повышает `families.version`;
  - `unlockFamily` («Қолмен қоюды алу», `action: unlock`);
  - `reorderCategories(order, seatingVersion, movedCategoryId?)` — **никого не двигает** (Р4), ранги пишутся под отложенным уникальным ограничением, `summary {categoryId, from, to}`; устаревшая версия → `conflict: version`;
  - `previewFullReseat` (без записи: переезды с именами, число закреплённых, неразмещённые, версия) и `applyFullReseat(seatingVersion)` — 409 возвращает **новый предпросмотр**;
  - `seatUnplaced` (`auto_place`, `summary.reason = "seatUnplaced"`);
  - `setupHall` — из Ф3, теперь возвращает `historyId` (тост H1 с «Қайтару»);
  - `undoSeatingChange(changeId)`.
  Доступ: изменения — `authorize(…, "seating")` (= `requireMember(…, {seating: true})`), чтение — `"member"`.
- [x] **Правила истории и отмены** (`undoKind`, `hall.ts`):
  - `categoryAdded`, а также операции списка (`added`, `deleted`, `restored`, `seats`, `answerReverted`) — без «Қайтару» (`hall.history.noUndo`); сервер отвечает `notUndoable`;
  - `undoChange` (домен, `undo.ts`): категории, которых нет в `before`, идут **после** восстановленных в прежнем относительном порядке, ранги 1…N без 0; сравнение порядка — только по категориям записи (новая категория после записи не мешает отмене). Unit + property 1 000 прогонов;
  - `revertAnswer` (Ф4) ставит исходной записи `reverted_by` через новый `revertOf` шага адаптера; повторная отмена → `changed`;
  - ответы гостей — без «Қайтару» (`hall.history.guestNoUndo`), сервер — `notUndoable`;
  - отменить можно и саму отмену (запись `undo` с `revert_of`, у исходной `reverted_by`);
  - частичная отмена → `skipped` (число семей) → `hall.history.partialUndo`; если не восстановилось ничего — `{reason: "changed", skipped}`.
- [x] **Защита адаптера:** `assertStepContract` — `noop: true` при непустых `deltas` → `SeatingContractError`, транзакция откатывается (unit + integration).
- [x] Адаптер: `revertOf` (запись `revert_of` + `reverted_by` исходной), `withOverflow` — в `summary.warn` записываются столы, которые этот шаг переполнил (H7 «12-үстелге 1 орын жетпейді»), `writeHallRows` / `writeCategoryRanks` (общие для H1 и отмены).
- [x] «Бос орынға ауыстыру» (Р3): `hallView.grew` = незакреплённая семья за переполненным столом (автоматика не переполняет, значит, выросли места; предпочтение — с самой свежей записью истории) + `suggestTable` движка → подтверждение → `moveFamily(reason: "suggested")` → `hall.history.suggestedMove`.
- [x] `hallView(eventId)` — одна сборка: `tableStats`, `totals`, семьи столов (места через `seatsOf`, кто закрепил, `version`, чей список), категории с местами и диапазонами столов («1–3», «7, 10–11»), дубли (`dupPairs` минус `duplicate_reviews`), неразмещённые, 20 последних записей истории. `historyView` для H7, `hallAttention` для точки у вкладки.

### 2.2 Экраны (`src/app/e/[eventId]/hall/**`, стили `src/ui/hall.css`)
- [x] **H1** `/hall/setup` — `HallSetupForm` Ф3; десктоп: слева настройки, справа живой предпросмотр (HallMap пустого зала) и карточка итога («Қонақтар: 173 орын», «(150 келеді + 23 …)», «Орын жетеді · N бос» / «N орын жетпейді · тағы M үстел керек» с красной рамкой). Уменьшение зала считает движком на клиенте, сколько семей пересядет (`hall.order.preview.moves`, см. откл. 4). `?tables=N` от «Үстел қосу». Без права рассадки — редирект на H2.
- [x] **H2** `/hall` по 8.7: телефон — SummaryLine (свёрнута), баннер «Отырғызылмағандар» только при первом показе в сессии (`sessionStorage`), затем чип; чипы переполнения/дублей/неразмещённых, сегмент «Схема | Тізім» в шапке, правило тостов B1. Десктоп ≥ 1024 — заголовок «Зал» + «4 қатар · 16 үстел · 12 орын» + сегмент; схема с легендой вписана по высоте; справа полная сводка, баннеры, ссылки («Отырғызу реті» + категории, «Өзгерістер тарихы · N» + «Соңғы өзгеріс: бүгін, 09:15», «Залды өзгерту»). Состояния: H2-E (пустая схема + «Қонақ қосу»), H2-N (→ H1, для «Тек тізім» — `hall.setup.notConfigured`), H2-L (`loading.tsx`, скелетон 480), H2-Over, только просмотр, чужие изменения, 409, Р3.
- [x] **H2-List** — Radix Accordion по столам (заголовок `h2`), «5/12 · 7 бос» / «14/12 · 2 орын жетпейді» с красной рамкой, категория с ромбом, строки семей с «Ауыстыру»; на десктопе две колонки.
- [x] **H3** — шторка Vaul (телефон снизу, десктоп справа 480 — `Sheet` кита): красный блок или «✓ 11 / 12 орын · 1 бос» / «Бұл үстел бос», крупная графика по семьям (цифры на первых стульях), «14 / 12 орын · Нағашылар», «Кімдер отыр», строки семей (закреплённые + «Қолмен қоюды алу»), «Келесі: 12-үстел →» для переполненных. Стол молодых / «Құрметті үстел» — своя шторка.
- [x] **H4** «Ауыстыру» — режим `?move=<familyId>` **на той же схеме** (тот же SVG, поэтому после ответа сервера стулья меняют цвет переходом 300 мс — W8): кандидаты пунктиром success и «N бос», неподходящие 45 %, текущий — кольцо lapis «қазір»; список «Бос орны жеткілікті үстелдер» под схемой (десктоп — справа) и свёрнутое «Басқа үстелдер (орын жетпейді)»; подтверждение — `Dialog` (телефон — шторка); при нехватке — красная строка, «Жоқ» с фокусом и «Бәрібір ауыстыру» (danger); шапка «Қай үстелге?» с ✕, без вкладок; системное «Назад» выходит из режима.
- [x] **H5** `/hall/order` (8.11, макет 15): ↑ / ↓ 48×48, у крайних — `aria-disabled` и 40 %, но на месте; FLIP 200 мс (W10, без анимации при reduced motion); фокус остаётся на нажатой кнопке в новой строке; баннер «Рет сақталды. Отырғызылғандар орнында қалды. …»; тост «{category} енді N-орында» + «Қайтару»; диапазоны столов не меняются. «Толық қайта отырғызу» → предпросмотр «N отбасы ауысады», «Қолмен қойылған M отбасы орнында қалады.», до 5 переездов + «және тағы K», «Иә, қайта отырғызу» / «Жоқ» (фокус); 409 → красная плашка `preview.stale` и новые числа; «ешкім ауыспайды» — только «Жоқ». «Тек тізім» — баннер, «Тек көру», без кнопки. Десктоп: список слева, схема справа.
- [x] **H6** — чип/баннер «Ұқсас: N» → шторка пар (рамка `--dup`, маркеры 1/2, «{list} · {category}», «N орын · M-үстел») → «Схемада көру»: кольца `--dup` с пульсом, маркеры, стулья семьи, остальные 30 %, плавающая панель с именами и «Жабу» (десктоп — справа внизу 440); «Біреуін өшіру» → выбор «Қайсысын өшіреміз?» → Ф4 `deleteFamily` + тост «Қайтару» (`restoreFamily`); «Екеуі де қалсын». Для «Тек тізім» — только «Схемада көру».
- [x] **H7** `/hall/history` (макет 16): группы «Бүгін / Кеше / 12 қазан» в поясе события; карточки с текстами по типам (`move`, `suggestedMove`, `order`, `categoryAdded`, `hall`, `unlocked`, `fullReseat`, `guestAdded` / `guestAddedUnplaced`, `guestDeleted` / `guestRestored`, `seatsEdited`, `answerSeats` / `answerNo`, `answerByPhoneYes` / `No`, `revertEntry`, `warning`); «Қайтару» по правилам 2.1; отменённые зачёркнуты + «↺ Қайтарылды · время · кто»; частичная отмена — плашка `partialUndo`; «Тек тізім» — без кнопок; пусто — `hall.history.empty`; подпись `footer`.
- [x] Точка внимания у вкладки «Зал» (`hallAttention`): переполнение, неразмещённые или непроверенные дубли — считается в `layout.tsx`.
- [x] Обновление: `VersionPoll` (как есть, не менялся) на H2 / H5 / H7. При новой версии записи **других** составителей с `seating_version_after` больше прежней дают тост «Анасы: N жаңа өзгеріс» + «Тарих» (`useOthersChanged`, в `showToast` добавлен необязательный `icon`).

## 3. Изменённые файлы

`git diff --stat d0fd07f..phase/F7b-hall` без скриншотов и документов дизайна/контента: **33 files changed, ~4 800 insertions(+), 53 deletions(-)**.

```
src/domain/seating/undo.ts                         (порядок с новыми категориями)
src/server/seating/{adapter.ts, hall.ts (новый), view.ts (новый)}
src/server/actions/hall.ts (новый)
src/server/events/service.ts   (setupHall → writeHallRows, historyId)
src/server/guests/service.ts   (revertAnswer → revertOf; familyEvent экспортирован)
src/app/e/[eventId]/{EventShell.tsx, layout.tsx}
src/app/e/[eventId]/hall/{page, loading, data, HallScreen, hall-client, history-text}
src/app/e/[eventId]/hall/{setup,order,history}/*
src/ui/hall.css (новый), src/app/globals.css (+1 import), src/ui/components/Toast.tsx (icon)
scripts/lib/seed-sample.ts     (diff истории сида: before = стол, откуда переехали)
tests/unit/{hall-adapter.test.ts, seating/undo-order-f7b.test.ts}
tests/integration/{hall.test.ts (новый), events.test.ts (historyId)}
tests/e2e/{hall.spec.ts, screens-f7b.spec.ts, global-setup.ts, worlds.ts}
```
Плюс в ветке два коммита документов из `main` (cherry-pick, см. откл. 1): `docs(content)` (ключи истории Ф7b) и `docs(design)` (макеты H2-List/H4/H5/H7).

**Новые зависимости:** нет. **Новые переменные окружения:** нет. **Миграций нет.**

## 4. Миграции

Нет. Используются существующие `seating_changes.revert_of / reverted_by`, `duplicate_reviews`, отложенное `unique (event_id, seating_rank)`.

## 5. Тесты — реальный вывод

Локально: Windows 11, Node 24, PGlite (`pnpm db:local --port 5533 --memory`), standalone-сервер на 3300. Переменные: `E2E_PORT=3300`, `DATABASE_URL=…127.0.0.1:5533…`, `E2E_CHANNEL=chrome` — общие конфиги не менялись.

```
$ pnpm typecheck
✓ Types generated successfully
$ pnpm lint
$ eslint --max-warnings=0
$ pnpm format:check
All matched files use Prettier code style!
$ pnpm check:messages
check:messages: OK — 796 keys, kk/ru: ICU, variables, tags, select/other, ru plural forms
check:presets: OK — 16 texts, 6 kinds × kk/ru, no samples, variables or markup
$ pnpm test
 Test Files  22 passed (22)
      Tests  175 passed (175)
$ pnpm test:all                      (unit + integration на PGlite)
 Test Files  33 passed | 1 skipped (34)
      Tests  297 passed | 2 skipped (299)
$ pnpm exec vitest run --project unit --coverage --coverage.include='src/domain/**'
All files        |   99.03 |    94.06 |     100 |     100 |
 seating         |   98.99 |    95.19 |     100 |     100 |
  undo.ts        |   97.46 |    95.83 |     100 |     100 | 45-46
Lines        : 100% ( 486/486 )
```

Новые тесты:
- **unit** `tests/unit/seating/undo-order-f7b.test.ts` (4, из них property × 1 000: перестановка → до 4 новых категорий в любых местах → отмена = прежний порядок + новые в их относительном порядке, ранги 1…N). Сначала тест упал (новая категория получала ранг 0), затем правка `undo.ts`. `tests/unit/hall-adapter.test.ts` — защита адаптера.
- **integration** `tests/integration/hall.test.ts` (18): доступ (Жастар и чужой → 403 на все 8 действий, Жастар читает зал); числа `hallView` на сиде (173 / 192, 15 столов, переполнение 7 и 12, одна пара дублей, «1–3»); Р3 → перенос `suggested`; перенос (версия, история, остальные на месте, 409 «Анасы, 16»); без `force` / с `force` + `warn`; неверный стол; `unlock`; порядок (никто не двигается, 409, отмена); `categoryAdded` без отмены и отмена старого порядка после новой категории; полная пересадка (предпросмотр = применение, 409 с новым предпросмотром, отмена целиком); частичная отмена (`skipped: 1`); отмена переноса и отмена отмены, `reverted_by` / `revert_of`; отмена переноса из сида; отмена смены зала; ответ гостя без отмены; `revertAnswer` → `reverted_by`; уменьшение зала с закреплённой семьёй за убранным столом; `seatUnplaced`; защита адаптера в транзакции.

**e2e** `pnpm test:e2e tests/e2e/hall.spec.ts --workers=1` (mobile 360 и desktop 1440), до перебазирования:
```
  ok  1 [mobile] › move with «Қайтару» (kk): candidates, confirm, toast, undo restores the table
  ok  2 [mobile] › «Бәрібір ауыстыру» (ru): a full table asks, then overflows
  ok  3 [mobile] › order ↑↓ moves nobody; full re-seat only with a preview
  ok  4 [mobile] › duplicates: sheet, «Схемада көру» highlights the pair, «Екеуі де қалсын»
  ok  5 [mobile] › history (ru): «Вернуть» on a move, the record is struck through; guest answers without it
  ok  6 [mobile] › «Тек тізім» (Жастар) sees the hall but no seating buttons (Ф3 review, deviation 9)
  ok  7 [mobile] › axe and 130 % on H2, list, table sheet, order, history, setup
  -   8, 9 [mobile] › two parents / B1   (только desktop-проект: свои контексты 1440, 360, 320)
  ok 10–16 [desktop] › те же 7
  ok 17 [desktop] › мама и папа move different families at the same time; both changes stay, each sees the other's after polling
  ok 18 [desktop] › B1: all problems + toast — ТӨР and the first row of tables visible without scrolling (360 and 320)
  2 skipped
  16 passed (2.7m)
```
Полный прогон всех e2e одним воркером (до последних правок): `157 passed, 22 skipped, 1 failed` — упал «два браузера» (`innerText` у SVG-подписи → `textContent`); после правки `hall.spec` зелёный в трёх отдельных прогонах. Спеки Ф1–Ф6 зелёные.

Запись теста «два браузера» — сам тест (`hall.spec` 17): Әкесі и Анасы открывают «Зал», каждый — «Ауыстыру» своей семьи, «Иә, ауыстыру» нажимаются одновременно → оба тоста; после `visibilitychange` (опрос 7.5) у каждого видны оба переноса; затем Анасы отменяет свой перенос в истории → у Әкесі тост «Анасы: 1 жаңа өзгеріс» + «Тарих». См. откл. 15 (PGlite).

Результат после перебазирования на `phase/RA-prep` — раздел 10.

## 6. Скриншоты

`docs/phases/F7b-screens/` (снимает `SCREENSHOTS=1 pnpm test:e2e tests/e2e/screens-f7b.spec.ts --project=desktop --workers=1`, мир `screensF7b` = сид design_spec 5.2):

| Файл | Что |
|---|---|
| 01–03 | H2 360: kk (первый экран), kk целиком, ru |
| 04–05 | H2 1440 kk / ru (раскладка 8.7) |
| 06 | H2 360, текст 130 % |
| 07 | H2 320 |
| 08–09 | «Тек тізім» (Жастар) 360 kk / 1440 ru |
| 10–11 | H2-List 360 / 1440 (раскрыт переполненный стол) |
| 12–13 | H3 стол 7 (переполнен, «Келесі: 12-үстел») 360 kk / 1440 ru |
| 14–15 | H4 360 / 1440 + `-confirm` (места хватает) и `-short` («Бәрібір ауыстыру») |
| 16–17 | H6 шторка дублей и «Схемада көру» 360 |
| 18–21 | H5 360 kk, 1440 ru, «Тек тізім», 130 % |
| 22 | Предпросмотр полной пересадки 360 |
| 23–26 | H7 360 kk, 1440 ru, «Тек тізім», 130 % |
| 27–28 | H1 360 kk / 1440 ru (14 столов: нехватка и «7 отбасы ауысады») |
| 29–30 | **B1**: все проблемы сразу + тост, 360 и 320 |
| 31–32 | Зал **20 × 16** на 360 и 1440 |

## 7. Критерии приёмки

| Критерий (бриф §4, план 12.3 Ф7b) | Статус | Как проверено |
|---|---|---|
| Каждое действие: доступ («Тек тізім» → 403), 409, история, `seating_version` | выполнен | integration |
| Полная пересадка: предпросмотр = применение при той же версии | выполнен | integration |
| Отмена переноса, порядка, зала, полной пересадки, в т. ч. частичная; `reverted_by` | выполнен | integration |
| Нет «Қайтару» у `categoryAdded` и ответов гостей | выполнен | integration + e2e история |
| `undoChange` с новыми категориями; защита адаптера | выполнен | unit / property 1 000 + integration |
| e2e: перенос с «Қайтару»; «Бәрібір ауыстыру»; ↑↓ без пересадки; полная пересадка с предпросмотром | выполнен | `hall.spec` 1–3 (kk и ru, 360 и 1440) |
| e2e: дубли и «Схемада көру»; история и отмена | выполнен | `hall.spec` 4–5 |
| e2e: «Тек тізім» не видит кнопок рассадки (ревью Ф3, откл. 9) | выполнен | `hall.spec` 6 (H2, H3, список, H5, H7; H1 → редирект) |
| Два браузера одновременно без потерь, второй видит после опроса | выполнен с оговоркой | `hall.spec` 17; на PGlite соединения обслуживаются по очереди (откл. 15) — настоящую гонку `for update` проверяет `concurrency.test.ts` на Postgres в CI |
| B1 на настоящем «Зал», 360 и 320, хозяин: все проблемы + тост, «ТӨР» и первый ряд без прокрутки | выполнен | `hall.spec` 18 (границы `.lbl-tor` и столов 1–4 выше тоста и вкладок), скриншоты 29–30 |
| axe, 130 % | выполнен | `hall.spec` 7: axe без нарушений на H2, списке, шторке, H5, H7, H1; 130 % без горизонтальной прокрутки |
| Схема 20 × 16 читается на 360 | выполнен | скриншоты 31–32 |
| Раскладка десктопа по 8.7 (Н1 ревью Ф1) | выполнен | скриншоты 04–05, 09, 11 |
| Анимации переноса ≤ 300 мс | выполнен | W8: переход `fill` 300 мс на том же SVG; W10 200 мс; reduced motion — без анимации |
| Проверка на preview URL, реальный Android | не выполнено | нет GitHub/Vercel (ждут основателя) |

## 8. Отклонения от брифа, плана и дизайна

1. **Документы из `main` в ветке фазы:** ключи истории (`786ac3e docs(content)`) и макеты H2-List/H4/H5/H7 (`b8c382d docs(design)`) взяты cherry-pick до мержа. Содержимое не менял; при перебазировании на `main` схлопнутся.
2. **H4 — режим `?move=<familyId>` на экране H2**, а не отдельный маршрут: «та же схема» буквально (один SVG — переход цвета стульев W8), системное «Назад» выходит из режима; в шапке иконка «←» кита с подписью «Жабу».
3. **`VersionPoll` не менялся** (бриф §6). Тост «чужие изменения» считается на странице по записям истории других составителей с `seating_version_after` больше прежней (`useOthersChanged`). В `showToast` добавлен необязательный `icon` (для «Тарих»).
4. **H1 «сколько семей пересядет»** — ключа нет, использован `hall.order.preview.moves` («{count} отбасы ауысады»).
5. **«Бос орындарға отырғызу»:** тост — `hall.order.preview.doneToast`, если никого не посадили — `hall.order.preview.unplaced`; в истории — `hall.unplaced.seatFree` + `common.units.families`. **Нужен ключ** `hall.history.seatUnplaced`.
6. **Временные составные тексты (нужны ключи):** ответ гостя «Келеміз» без прежнего числа мест — имя + `common.status.yesWithSeats` (`hall.history.guestYes`); перенос неразмещённой семьи в подтверждении — `hall.move.currentNone` + «→ N-үстел» (`hall.move.confirm.routeNew`); «—» вместо номера, если стола нет.
7. **Зачёркнутые записи H7 — цвет `--ink-2`, а не 60 % прозрачности:** с прозрачностью axe находит нарушение контраста AA.
8. **Баннер Р3 «Бос орынға ауыстыру»** на телефоне — под схемой (иначе ломается B1), на десктопе — в правой колонке, плюс в шторке этого стола.
9. **«Кто вырос» (Р3)** — эвристика: незакреплённая семья за переполненным столом (автоматика не переполняет), предпочтение — с самой свежей записью истории.
10. **Правила «Қайтару» шире брифа:** без отмены и операции списка (новый гость, удаление/возврат — у них своя «Қайтару» в S1/H6, правка мест) и первая настройка зала (`hall.before = null`); ответ по телефону отменяет только его автор (`revertAnswer`, Ф4 П2).
11. **409 переноса** сравнивает `families.version`, которую повышают и правки имени/мест; текст «{member} … N-үстелге» берёт текущий стол и того, кто закрепил, иначе — `errors.conflict`.
12. **Сид:** `diff` записей h1–h5 хранит `before.tableNo` = стол, откуда переехали (было `null` — «Қайтару» сняла бы семьи со столов).
13. **Исправлен скрытый дефект Ф3:** уменьшение зала при закреплённой семье за убранным столом падало на `families_lock_check` (FK обнулял только `table_no`). `writeHallRows` сначала снимает стол и закрепление.
14. **`hallView` / `hallAttention` читают базу последовательно:** параллельные запросы открывают несколько соединений, и локальный PGlite их обрывает. На Postgres разница — миллисекунды.
15. **e2e:** миры Ф7b отдельным блоком, телефоны `+7701{n}00000{1|2|3}` (схема `+7700{i}…` ломается при `i ≥ 10`), сессия Анасы — только в этих мирах; «два браузера» грузят страницы по очереди, записи — одновременно (PGlite обслуживает соединения последовательно); открытие шторки повторяется до гидратации; порт/БД/Chrome — переменными окружения.
16. **Подстраницы H1/H5/H7 на десктопе** — без «←» в шапке (заголовок в контенте, навигация панелью); H1 — без вкладок (форма, как S2).
17. **Сводка на десктопе** «173 / 192 орын · 19 бос» одним размером (в макете «· 19 бос» мельче).
18. **`reorderCategories`** принимает необязательный `movedCategoryId` для текста истории; сервер проверяет, что категория сменила место.

## 9. Самопроверка по 13.6

- [x] Задачи фазы выполнены (раздел 2), отклонения записаны (раздел 8).
- [ ] Preview URL — нет (GitHub/Vercel ждут основателя).
- [x] `src/domain` без импортов `server/ui/next`; правка домена — только `undo.ts`, с тестами.
- [x] Server Actions тонкие: сессия → zod → сервис (`authorize(…, "seating")`) → `withSeating`; места меняет только адаптер по `deltas`.
- [x] Нет запрещённого 4.4; новых зависимостей и миграций нет.
- [x] Тексты только из `content/messages` (временные составные места — откл. 5–6); `check:messages` OK.
- [x] Имена выводятся как текст; телефонов на экранах зала нет.
- [x] Тесты зелёные: unit 175, integration 122 (+2 только для Postgres), e2e `hall.spec` 16/16.
- [x] Цели ≥ 48 px, текст ≥ 16 px (кроме меток схемы 14), aria на столах, шторках и диалогах, axe без нарушений, 130 % и 320 px без горизонтальной прокрутки, reduced motion.

## 10. Перебазирование на `phase/RA-prep`

`git rebase phase/RA-prep` (РА — `5cafe8a` + `0ce3acf`): **без конфликтов**. Повторно применённые коммиты (Ф5/Ф6 и два cherry-pick документов из `main`) git пропустил сам; 11 коммитов Ф7b — поверх `0ce3acf`. Точки касания: `VersionPoll` РА принимает необязательный `activity` — экраны зала передают только `version` (следят за рассадкой), совместимо; миры e2e — оба блока на месте; S1 и маршрут версии Ф7b не трогала.

Проверки после перебазирования:
```
$ pnpm typecheck            ✓ Types generated successfully
$ pnpm lint                 eslint --max-warnings=0 (без замечаний)
$ pnpm format:check         All matched files use Prettier code style!
$ pnpm check:messages       OK — 801 keys …; check:presets OK; check:legal OK (34 × [ЮРИСТ] — черновики РА)
$ pnpm test:all             Test Files  35 passed | 1 skipped (36)
                                 Tests  303 passed | 2 skipped (305)
  (первый прогон: 2 таймаута в тестах загрузки музыки — ffmpeg под нагрузкой машины; повтор зелёный)
$ pnpm build                ✓ Compiled successfully
$ pnpm test:e2e tests/e2e/hall.spec.ts --workers=1
  16 passed, 2 skipped (2.8m) — все 7 сценариев на mobile и desktop, «два браузера», B1 360/320
```
Полный e2e всех фаз после перебазирования не перезапускался (долго на этой машине); до него — раздел 5.

Замечание по среде: `next build` из фонового Git Bash дважды падал с `0xc0000142` (Windows не смог запустить дочерний процесс Turbopack); из PowerShell собирается. Код ни при чём.

## 11. Что осталось

- Ключи у контент-лида: `hall.history.seatUnplaced`, `hall.history.guestYes`, `hall.move.confirm.routeNew` (откл. 5–6); по желанию — свой текст предупреждения H1.
- CI на Postgres 16 (гонка двух переносов — `concurrency.test.ts`), preview и реальный Android — после аккаунтов основателя.
