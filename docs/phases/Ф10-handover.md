# Ф10 · Печать и экспорт — пакет сдачи

Версия 1.0 · 2026-10-16 · второй full-stack разработчик (агент) → архитектор
Бриф: `docs/phases/Ф10-brief.md` v1.0. План v1.9: 12.3 Ф10, 14, 6.7. Дизайн: `DESIGN_v2.md` 8.22. Образец формата: `D:/My Project/toi-seating/gen.js` (код и данные **не переносились**).

**Статус:** код готов, коммиты на `phase/F10-export`. По новому правилу основателя полный прогон тестов, e2e и скриншоты **не запускались** — они в разделе 9 и ждут тест-раннера. Запускались только точечные проверки (раздел 5). Аккаунты не использовались. Миграций нет.

---

## 1. Ссылки

| Что | Где |
|---|---|
| Ветка | `phase/F10-export` от `phase/F9-budget`, worktree `D:/My Project/toi-f7b` |
| Печать | `/e/{id}/print/tables` (ссылки — на «Зал» и на «Қорытынды») |
| Excel | `GET /e/{id}/export/tables.xlsx` |
| Контент | cherry-pick `97e9e49` (`print.*`, `export.*`, `budget.item.paidLine`) |

## 2. Что сделано

### 2.1 Общие форматтеры `src/domain/format/` (§4)
- В модуле:
  - `formatMoney`;
  - `formatDayMonth` / `formatDate` / `formatDateTime` / `formatTime` / `formatNumericDay` / `formatNumericDateTime` / `datePlate` / `formatWeekday` / `monthName` — kk / ru, **названия месяцев и дней недели — константы модуля**;
  - `dayKey`, `daysAgo`, `daysUntil`, `relativeDay` («бүгін / кеше / N күн бұрын» — какой текст из `common.time.*` показать).
- Часовой пояс — параметр, по умолчанию `Asia/Almaty`. `Intl` для казахских текстов не используется: `Intl.DateTimeFormat("en-GB")` только читает числовые части момента в поясе.
- Переведены на модуль:
  - страница гостя (`domain/invitations/dates.ts`: день недели, месяц, «N күн қалды»);
  - дата в тексте wa.me (`domain/guests/wa.ts`);
  - «N күн бұрын жіберілді» (`domain/guests/status.ts` → `daysAgo`);
  - строки события (шапка, «Менің тойларым», `/join`);
  - «Зал» («Соңғы өзгеріс»), H7 (время, группы дней);
  - «Составители» (`12.11, 14:05`);
  - бюджет (плашки дат, `formatMoney`, «сегодня»);
  - «Қорытынды» (суммы);
  - печать и Excel.
- Unit-тесты: kk / ru, полночь по Алматы, конец месяца, относительные дни.

### 2.2 Печать — `/e/[eventId]/print/tables` (§2, по образцу основателя)
- Доступ — любой составитель (`hallView` → `requireMember`), в том числе «Тек тізім».
- Данные — чистая функция `buildPrintPlan` (`src/domain/print/`): все числа из `tableStats` / `totals`; отказавшиеся не печатаются; ожидаемые — «~N» и пометка `print.pendingMark`.
- Порядок страницы:
  1. **Шапка** `print.title`, `print.header` (название · дата · ресторан), `print.generatedAt`; кнопки `print.button` (`window.print()`) и `export.button` — при печати скрыты.
  2. **Схема зала** `print.map.title`: серверный `PrintHallMap` с той же геометрией ячеек, что `HallMap` (геометрия вынесена в `src/ui/hall/geometry.ts`), 2 / 4 колонны, стол молодых у «ТӨР»:
     - стулья окрашены **по категории семьи** в порядке списка, свободные — пунктирные кольца;
     - стол с разными категориями — диск из двух половин и пунктирное внешнее кольцо;
     - под столом «занято / мест»; переполненный — красным.
     - Легенда `print.legend.title`: цвет **и подпись** каждой категории с местами, «Бос орын», «Аралас үстел», пометка «~».
  3. **По столам** `print.byTables.title`: блок на стол (`break-inside: avoid`, 2 колонки на A4) — номер, `print.table.total`, основная категория, «Аралас үстел», таблица «Отбасы / Орын / Келді □».
  4. **По категориям** `print.byCategory.title`: категория → `print.byCategory.meta` (семьи · места · столы «1–3») → семьи с местами и столом.
  5. **Аты → үстел** — алфавит (казахская сортировка) в две колонки: бумажная копия для помощника на входе.
  6. **Отырғызылмағандар** (`hall.unplaced.title`), если такие есть.
- A4 книжная, `@page { size: A4; margin: 12mm }`. Номера страниц — `@page @bottom-center` с текстом из `print.pageOf` (Chrome 131+; где не поддерживается — номеров нет, в шапке есть `generatedAt`). Каждый раздел — с новой страницы. При печати скрыты боковая панель, вкладки, шапка и тосты.

### 2.3 Excel — `GET /e/[eventId]/export/tables.xlsx` (§3)
- `requireUser` → `printView` (составитель события) → `exceljs`. Чужому — 403, без входа — 401. `cache-control: no-store`.
- Листы:
  - «Үстелдер» (по столам, затем без места);
  - «Қонақтар» (по алфавиту): Үстел · Аты · Орын · Санаты · Жауабы · Кімнің тізімі;
  - «Санаттар»: Санаты · Отбасы саны · Орын · Үстелдер.
- Заголовки из `export.columns.*` на языке интерфейса; строка заголовка закреплена; ширина колонн по содержимому; числа — числами. **Телефонов нет.**
- Имя файла латиницей: `toi-aibek-dana-2026-11-15.xlsx` (транслитерация казахских и русских букв, без «пен / мен / бен / и / &»).
- `activity_log`: `kind = 'export'`, `meta = {format: "xlsx"}`, без персональных данных.

### 2.4 Ф9: строка статьи по макету
`budget.item.paidLine`: справа сумма плана и под ней «Төленді: …» (как в макете 13). Строка «Жоспар · Төленді» из строки статьи убрана.

## 3. Изменённые файлы

`git diff --stat phase/F9-budget..phase/F10-export` (без `content/` и lockfile): **36 files changed, 1672 insertions(+), 168 deletions(-)**.

```
src/domain/format/index.ts            (новый)  общие форматтеры
src/domain/print/index.ts             (новый)  план печати, диапазоны столов, имя файла
src/domain/{invitations/dates.ts, guests/wa.ts, guests/status.ts, budget/index.ts}   → общий модуль
src/server/print/queries.ts           (новый)
src/server/export/xlsx.ts             (новый)
src/app/e/[eventId]/print/tables/{page.tsx, PrintActions.tsx}   (новые)
src/app/e/[eventId]/export/tables.xlsx/route.ts                 (новый)
src/ui/hall/{geometry.ts (новый), PrintHallMap.tsx (новый), HallMap.tsx}
src/ui/print.css (новый), src/app/globals.css (+1 import)
src/app/e/[eventId]/{EventShell, layout, summary/page, hall/HallScreen, hall/history/*, hall/layout, budget/*, settings/members/MembersScreen}
src/app/e/page.tsx, src/app/(auth)/join/[token]/page.tsx, src/i18n/client-messages.tsx (заголовок печати в шапке)
src/server/seating/view.ts (tableRanges из domain/print)
tests/unit/{format,print}.test.ts, tests/integration/export.test.ts, tests/e2e/{print,screens-f10}.spec.ts
```
**Новая зависимость:** `exceljs` 4.4.0 (план 2, бриф §3). Только на сервере, в бандл клиента не попадает. **Миграций нет.**

## 4. Миграции

Нет.

## 5. Проверки, которые запускал я (точечные)

```
$ pnpm typecheck                                   ✓ Types generated successfully
$ pnpm lint                                        eslint --max-warnings=0 (без замечаний)
$ pnpm check:messages                              check:messages: OK — 818 keys …
$ pnpm exec vitest run tests/unit                  Tests  190 passed (190)   (до print.test.ts)
$ pnpm exec vitest run tests/unit/format.test.ts   Tests  4 passed (4)
$ pnpm exec vitest run tests/unit/print.test.ts    Tests  4 passed (4)
$ pnpm exec vitest run --project integration tests/integration/export.test.ts   Tests  2 passed (2)
```
Сборка, e2e и скриншоты — не запускал (раздел 9).

## 6. Скриншоты

Не сняты (правило основателя). Команда — в разделе 9. Результат ляжет в `docs/phases/F10-screens/`:
- `01-print-kk-360.png`, `02-print-kk-1440.png`, `03-print-ru-1440.png`;
- `seating-kk.pdf`, `seating-ru.pdf` (A4, с фоном);
- `seating-*-bw-check.pdf` (без фона — проверка чёрно-белой читаемости).

## 7. Критерии приёмки

| Критерий брифа | Статус | Как проверить |
|---|---|---|
| 1. Файл открывается в Excel и Google Sheets, казахские буквы на месте | частично | integration: `exceljs` читает 3 листа, «Сапарбаевтар», «Құдалар». Открыть в Excel / Google Sheets — вручную после e2e (файл скачивает `print.spec`) |
| 2. PDF из браузера читаем и чёрно-белым | ждёт тест-раннера | `screens-f10` пишет PDF с фоном и без. В Ч/Б различимы: занятые стулья — заливка с контуром, свободные — пунктир, «аралас» — пунктирное кольцо, легенда с подписями |
| 3. Вид и состав печати по образцу основателя | сделано, ждёт скриншотов | схема с окраской по категориям, по столам, по группам, «Аралас үстел»; плюс алфавит и «Отырғызылмағандар» по брифу |
| 4. Даты и суммы во всём приложении — через общий модуль | выполнен | раздел 2.1; `grep -rn "Intl.DateTimeFormat(\"kk\|dateTime(" src` — только числовые части в `domain/format` и `rsvpClosesAt` (en-GB) |
| 403 чужому (печать и xlsx); строк = семей с местами; телефонов нет | выполнен (integration) | `tests/integration/export.test.ts` |
| e2e: print media, `page.pdf()`, xlsx, kk / ru | ждёт тест-раннера | `tests/e2e/print.spec.ts` |

## 8. Отклонения

1. **Номера страниц** — `@page @bottom-center` (текст из `print.pageOf`), работает в Chrome 131+ и Edge. В Firefox / Safari номеров нет, в шапке остаётся `print.generatedAt`. Номер в подвале каждой секции не делал: секции идут по нескольку страниц, номер в конце секции вводил бы в заблуждение.
2. **«Аралас үстел» на схеме** — диск из двух половин (как в образце) и пунктирное кольцо, объяснённое в легенде. Подписи групп сбоку от стола, как в образце, не помещаются в сетку 4 колонок 328 px — названия семей и групп есть в разделах «По столам» и «По категориям».
3. **Стулья окрашены оттенками категорий из токенов** (светлые) с тёмным контуром. Отдельных «чернильных» цветов категорий для печати не добавлял: правило — цвета только в `tokens.css`. В Ч/Б различие даёт контур и пунктир, а не цвет.
4. **`Intl.Collator("kk")`** для сортировки имён (алфавит, «Қонақтар») остался: это порядок, а не текст. Без казахских данных в браузере сортировка просто менее точная; печать и Excel сортируются на сервере (Node с ICU).
5. **Имя файла** транслитерируется своей таблицей (ә→a, ғ→g, қ→q, ң→n, ө→o, ұ/ү→u, і→i, х→kh …), служебные «пен / мен / бен / и / &» убираются: «Айбек пен Дана» → `toi-aibek-dana-2026-11-15.xlsx`.
6. **«Жауабы» в Excel** — «Келеді» или «Жауап жоқ» (`common.status.*`). Отказавшихся в файле нет (их нет и в печати).
7. **Печать — внутри рамки события** (боковая панель, вкладки), при печати рамка скрыта. Отдельного макета без рамки не делал.
8. **`hallView` используется для печати** (одна сборка данных зала, история — 1 запись).
9. Ф9: строка статьи по макету через `budget.item.paidLine` — правка по готовому ключу.

## 9. Проверки — ожидают тест-раннера

Запускать в worktree `D:/My Project/toi-f7b`, ветка `phase/F10-export`. **Все команды — в PowerShell** (сборка из фонового Git Bash падает с `0xc0000142`). Порты только **3300** (сайт) и **5533** (PGlite); главный worktree и порты 3000–3200 / 5433–5435 не трогать.

1. **БД:**
   ```powershell
   Set-Location "D:\My Project	oi-f7b"
   $env:PATH = "$env:APPDATA
pm;$env:PATH"
   $pg = Start-Process node -ArgumentList "node_modules/tsx/dist/cli.mjs","scripts/db-local.ts","--port","5533","--memory" -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
   ```
2. **Статические проверки и vitest:**
   ```powershell
   pnpm typecheck; pnpm lint; pnpm format:check; pnpm check:messages
   pnpm test:all            # unit + integration (PGlite в памяти, своя)
   ```
3. **Сборка:** `pnpm build`.
4. **Переменные для e2e** (в том же окне):
   ```powershell
   $env:E2E_PORT="3300"; $env:DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5533/postgres?sslmode=disable"
   $env:DATABASE_DRIVER="pg"; $env:STORAGE_DRIVER="local"; $env:E2E_CHANNEL="chrome"
   ```
5. **e2e Ф10:** `pnpm test:e2e tests/e2e/print.spec.ts --workers=1`.
6. **Полный последовательный e2e** (всё приложение, из-за миграции форматтеров):
   ```powershell
   pnpm test:e2e --workers=1
   ```
   Особенно важны спеки с датами и суммами: `summary`, `guests`, `invite`, `budget`, `hall`, `events`, `auth`. Если упал `/api/health` или идёт `Connection terminated unexpectedly`, значит упал PGlite: перезапустить шаг 1 и повторить.
7. **Скриншоты и PDF:**
   ```powershell
   $env:SCREENSHOTS="1"; pnpm test:e2e tests/e2e/screens-f10.spec.ts --project=desktop --workers=1; Remove-Item Env:SCREENSHOTS
   ```
   Результат — в `docs/phases/F10-screens/`. Закоммитить: `git add docs/phases/F10-screens; git commit -m "docs(F10): screenshots and PDFs"` (с трейлером `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
8. **Остановить всё:**
   ```powershell
   Stop-Process -Id $pg.Id -Force
   Get-NetTCPConnection -LocalPort 3300,5533 -State Listen -ErrorAction SilentlyContinue | % { Stop-Process -Id $_.OwningProcess -Force }
   ```
9. **Вручную** (основатель или архитектор): открыть скачанный `toi-aibek-dana-….xlsx` в Excel и в Google Sheets; распечатать `seating-kk-bw-check.pdf` в Ч/Б.

## 10. Самопроверка (13.6)

- [x] `src/domain/{format,print}` — чистый TS, unit-тесты; Server Actions / route handler тонкие (`requireUser` → `authorize` через `hallView` → данные).
- [x] Новая зависимость одна (`exceljs`, по плану), только сервер; миграций нет.
- [x] Тексты только из `content/messages`. Исключение по брифу — названия месяцев и дней недели в константах `domain/format`.
- [x] Телефонов нет ни в печати, ни в Excel; имена выводятся как текст.
- [ ] e2e, скриншоты, полный прогон — ждут тест-раннера (раздел 9).
