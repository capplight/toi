# Ф7a · Движок рассадки — пакет сдачи

Версия 1.0 · 2026-10-09 · full-stack разработчик (агент) → архитектор
Бриф: `docs/phases/Ф7a-brief.md` v1.0. План: `architecture/ARCHITECTURE_PLAN.md` v1.3, разделы 5.1, 5.2, 7; `design/design_spec.md` 3.13, 5.2, 6.1, 6.2.

**Статус:** все задачи брифа выполнены; критерии приёмки выполнены (раздел 7). Фаза не зависит от аккаунтов.

---

## 0. Предварительные шаги по ревью Ф0

Сделано по `docs/phases/Ф0-review.md`, раздел 4, и указанию координатора:

1. `git switch main` → в `git status design/` были только файлы дизайнера (`design/DESIGN_v2.md`, `design/v2/index.html`, 22 новых `design/v2/screenshots/*.png`; исходников обложек нет) → коммит **`8713fc4` `docs(design): DESIGN v2.2 — spec, gallery, screenshots`** в `main`.
2. `git rebase main` сначала отказал: `error: cannot rebase: You have unstaged changes` — в рабочей папке лежали изменения архитектора (`docs/phases/Ф2-brief.md` изменён, `docs/phases/Ф0-review.md` новый). По тому же правилу ревью («документы архитектора — в `main` отдельными коммитами `docs(...)`») — коммит **`7a34cb4` `docs(architecture): Ф0 review, Ф2 brief update`** в `main`. После этого `git rebase main` → `Successfully rebased and updated refs/heads/phase/F0-setup`. См. отклонение 1.
3. В `AGENTS.md` (ветка `phase/F0-setup`, коммит `abc357d`) добавлено правило: документы дизайнера, контент-лида и архитектора — в `main` коммитами `docs(...)`, в ветке фазы только код и handover, после такого коммита — `git rebase main`.

Граф сейчас:
```
main:            e1b3fd3 → 8713fc4 docs(design) → 7a34cb4 docs(architecture)
phase/F0-setup:  … 7a34cb4 → 864803e → 0775f1c → 7858e42 → 6a25722 → abc357d (AGENTS.md)
phase/F7a-seating: … abc357d → 673831c feat(F7a) → (этот handover)
```
Ф0 ещё не в `main`, поэтому ветка Ф7a идёт от `phase/F0-setup`. После мержа Ф0 — `git rebase main`.

## 1. Ссылки

| Что | Где |
|---|---|
| Ветка | `phase/F7a-seating` (локально; remote нет — ждёт GitHub основателя) |
| PR / preview | нет (GitHub/Vercel ждут основателя); preview фазе не нужен — UI нет |
| Демо-логин | не нужен (только `src/domain`) |

## 2. Что сделано (чек-лист брифа)

- [x] **Типы** (`src/domain/seating/types.ts`): `HallConfig {columns: 2|4, tables, seatsPerTable}`, `Category {id, rank}`, `Family {id, categoryId, rsvp, expected, confirmed, tableNo, locked, lockedBy?, seq}`, `SeatingState`, `SeatDelta {familyId, from, to, locked}`, `Warning`, `SeatingResult`, `SeatingError`.
- [x] **`layout.ts`** — `layoutTables` 1:1 из прототипа: нумерация слева направо и сверху вниз, уровни, колонны, близость 2, 3, 1, 4; неполный последний уровень — в центральные колонны.
- [x] **`fullReseat.ts`** — `autoSeat` 1:1 (закреплённые на месте; закрепление снимается, если стола нет или мест 0; старт категории = последний стол предыдущей, после первой категории +1; семья целиком; кто не поместился — в неразмещённые) + `previewFullReseat` (список переездов без применения).
- [x] **`incremental.ts`** — `placeIncremental(state, familyIds)` по 7.3: своя зона → столы после зоны → старт после предыдущей категории (+1 после первой) → столы ближе к төру; те же ограничения. Плюс `suggestTable` для «Бос орынға ауыстыру» (Р3).
- [x] **Обработчики 7.2** (`events.ts`): новый гость, «нет»/«да», рост и уменьшение мест, удаление и «Қайтару», перенос (с `force` = «Бәрібір ауыстыру»), «Автоматқа қайтару», смена порядка (никого не двигает), зал больше и меньше, вместимость меньше.
- [x] **`stats.ts`** — `tableStats` (порт): занятость, переполнение, основная категория стола, неразмещённые, число занятых столов; `totals` (порт + `usedTables` для «Мейрамханаға N → M»).
- [x] **`undo.ts`** — `buildDiff` в формате 5.2 (`families`, `order`, `hall`), `invertDiff`, `undoChange` с проверкой текущего состояния (изменившиеся позже семьи, порядок или зал пропускаются, предупреждение `undo_skipped`).
- [x] **Дубли** — `src/domain/guests/duplicates.ts`: `nameKey`, `similar`, `pairKey`, `dupPairs` со стоп-словами прототипа.
- [x] **Лимит 20 мест** (Д4/13): `MAX_FAMILY_SEATS = 20`, `validateFamily` отклоняет 0, 21 и дробные значения.
- [x] **Фикстура** `tests/fixtures/sample-event.ts` — общая с сидами Ф2. Данные сгенерированы один раз из `RAW` прототипа, без ручного переноса: 65 семей, составители, категории, зал, ожидаемая колонка «Стол», итоги, пара дублей.

Без `Date.now()`, `Math.random`, React, БД (проверено `grep` и правилом ESLint, раздел 5.3).

## 3. Изменённые файлы

`git diff --stat phase/F0-setup...phase/F7a-seating` (без lockfile): **25 files changed, 3344 insertions(+)**, из них фикстура — 1 104 строки (Prettier развернул объекты).

```
src/domain/seating/{types,family,layout,occupancy,fullReseat,incremental,events,stats,undo,util,index}.ts
src/domain/guests/duplicates.ts
tests/fixtures/sample-event.ts
tests/unit/seating/{helpers.ts,golden,layout,incremental,events,undo-stats,properties,edge-perf}.test.ts
tests/unit/duplicates.test.ts
package.json, pnpm-lock.yaml (fast-check)
src/domain/seating/.gitkeep — удалён
```

**Новая зависимость:** `fast-check` 4.10.2 (dev) — указана в плане (раздел 2 «Тесты», 7.4) и брифе.
**Новые переменные окружения:** нет. **Миграций:** нет.

## 4. Контракт для Ф2, Ф4, Ф7b — экспорт `@/domain/seating`

Все функции чистые. Вход не изменяется (это проверено property-тестом на замороженных объектах). Возвращается новое состояние.

```ts
// типы
type Rsvp = "yes" | "no" | "pending";
type HallConfig = { columns: 2 | 4; tables: number; seatsPerTable: number };
type Category = { id: string; rank: number };
type Family = { id; categoryId; rsvp: Rsvp; expected: number; confirmed: number | null;
                tableNo: number | null; locked: boolean; lockedBy?: string | null; seq: number };
type SeatingState = { hall: HallConfig | null; categories: readonly Category[]; families: readonly Family[] };
type SeatDelta = { familyId: string; from: number | null; to: number | null; locked: boolean };
type Warning = { kind: "unplaced"; familyId } | { kind: "table_overflow"; tableNo; missing }
             | { kind: "move_overflow"; familyId; tableNo; missing } | { kind: "lock_dropped"; familyId }
             | { kind: "undo_skipped"; familyIds: string[]; order: boolean; hall: boolean };
type SeatingResult = { state: SeatingState; deltas: SeatDelta[]; warnings: Warning[] };
class SeatingError extends Error {}           // неверный вход: неизвестная семья/стол, мест вне 1…20, дубли id

// значения и проверки
const MAX_FAMILY_SEATS = 20;
seatsOf(f: Pick<Family, "rsvp" | "expected" | "confirmed">): number
validateFamily(f: Family): void;  validateHall(h: HallConfig): void;  validateState(s: SeatingState): void

// зал
layoutTables(hall: HallConfig): { tables: TableInfo[]; proximity: TableInfo[]; levels: number }
  // TableInfo = { no, level, column, capacity, pos }

// рассадка
fullReseat(state): SeatingResult                                   // «Толық қайта отырғызу», 6.1
previewFullReseat(state): { moves: SeatDelta[]; unplaced: string[]; result: SeatingResult }
placeIncremental(state, familyIds: readonly string[]): SeatingResult   // 7.3, рассаженных не двигает
suggestTable(state, familyId): number | null                       // «Бос орынға ауыстыру» (Р3)

// события 7.2
setupHall(state, hall): SeatingResult
addFamily(state, family): SeatingResult
setRsvp(state, familyId, rsvp, counts?: { confirmed?: number | null; expected?: number }): SeatingResult
setSeats(state, familyId, counts: { confirmed?: number | null; expected?: number }): SeatingResult
removeFamily(state, familyId): SeatingResult & { removed: Family }
restoreFamily(state, removed: Family): SeatingResult
moveFamily(state, familyId, to: number, opts?: { force?: boolean; by?: string | null }): SeatingResult
unlockFamily(state, familyId): SeatingResult
reorderCategories(state, order: readonly string[]): SeatingResult

// подсчёты
tableStats(state): { tables: TableStat[]; proximity: TableStat[]; levels; overfull: TableStat[];
                     unplaced: string[]; usedTables: number }
  // TableStat = TableInfo & { used, free, missing, familyIds, mainCategoryId }
totals(state): { confirmed; expected; toSeat; capacity; free; usedTables }

// история и отмена (формат 5.2)
buildDiff(before, after): SeatingDiff        // { families: {id, before, after}[]; order?; hall? }
invertDiff(diff): SeatingDiff
undoChange(state, diff): SeatingResult & { applied: SeatingDiff }

// @/domain/guests/duplicates
nameKey(name): string;  similar(a, b): boolean;  pairKey(a, b): string
dupPairs<T extends {id; name; rsvp; tableNo}>(families: readonly T[], reviewed?: ReadonlySet<string>): [T, T][]
```

Как вызывает сервер (Ф2+). Под блокировкой события: загрузить состояние → вызвать функцию → записать `state.families` по `deltas` → записать `buildDiff(before, result.state)` в `seating_changes.diff` → показать `warnings`.

## 5. Тесты и проверки — реальный вывод

### 5.1 Золотой тест (design_spec 5.2)
`fullReseat(sampleState())` — колонка «Стол» совпадает **полностью** (`toEqual(expectedTables)`, 65 семей). Совпадают и занятость столов, и порядок семей за столом:
```
| 1 | 5/12 | Райхан құдағи отбасы, Жұпар құдағи |
| 2 | 11/12 | Сапарбаевтар (бас құда), Нұрболат құда отбасы |
| 3 | 12/12 | Әділбек құда отбасы, Тимур құда отбасы, Сәкен құда отбасы |
| 4 | 12/12 | Қайрат отбасы, Серікбай ағай отбасы, Жанар апай |
| 5 | 12/12 | Талғат отбасы, Мұрат ағай отбасы, Болат ағай отбасы |
| 6 | 12/12 | Ғабит ағай отбасы, Бауыржан ағай отбасы, Ермек отбасы |
| 7 | 14/12 (−2) | Гүлнар апай отбасы, Мейрамбек нағашы отбасы, Әйгерім отбасы |
| 8 | 11/12 | Жомарт отбасы, Нұрлан мен Әсем, Ербол нағашы отбасы |
| 9 | 12/12 | Ақылбек ағай отбасы, Ержан отбасы, Темірлан отбасы, Самат отбасы |
| 10 | 12/12 | Ерлан ағай отбасы, Даурен нағашы отбасы, Қанат отбасы |
| 11 | 12/12 | Бибігүл апай отбасы, Нұрсұлу апай отбасы, Алмагүл апай отбасы, Күләш апай |
| 12 | 13/12 (−1) | Бақытжан отбасы, Сәуле апай, Марат отбасы, Ләззат апай отбасы, Роза отбасы |
| 13 | 12/12 | Қуаныш отбасы, Бекзат отбасы, Нұржан отбасы, Әлия, Ерасыл, Айдана, Зейнеп апай, Дина |
| 14 | 12/12 | Арман отбасы, Дидар мен Томирис, Мадина отбасы, Шынар, Аружан, Ернұр, Санжар, Әлихан, Асхат |
| 15 | 11/12 | Бақытжан Омаров отбасы, Дархан отбасы, Ғалым отбасы, Нәзира отбасы, Ақбота, Нұрислам, Тоғжан |
| 16 | 0/12 | — |
{"confirmed":150,"expected":23,"toSeat":173,"capacity":192,"free":19,"usedTables":15}
[{"kind":"table_overflow","tableNo":7,"missing":2},{"kind":"table_overflow","tableNo":12,"missing":1}]
```
Сводные числа: **150 подтверждено, 23 ожидаемых, 173 к рассадке, 19 свободно** — как в брифе. Дубль на тех же данных — ровно одна пара f38 (стол 12) / f15 (стол 15).

### 5.2 `pnpm test` (весь проект)
```
 Test Files  14 passed (14)
      Tests  123 passed (123)
```
Ф7a добавила 81 тест в 8 файлах: `golden` 6, `layout` 6, `incremental` 15, `events` 22, `undo-stats` 8, `properties` 10, `edge-perf` 10, `duplicates` 4. Полный список с названиями — в выводе `pnpm exec vitest run tests/unit/seating tests/unit/duplicates.test.ts --reporter=verbose`.

### 5.3 Property-тесты (fast-check 4.10.2), по 1 000 прогонов каждый — всего **10 000**
| № 7.4 | Свойство | Прогонов |
|---|---|---|
| 1 | Ни одна операция, кроме полной пересадки, отмены и переноса этой же семьи, не меняет стол другой рассаженной семьи. Случайно выбирается одна из 10 операций: add, setRsvp, setSeats, remove, remove+restore, unlock, reorder, зал больше, placeIncremental, move | 1 000 |
| 1b | Зал меньше: двигаются только семьи с убранных столов | 1 000 |
| 2 | Автоматика не создаёт переполнение: столы, куда она добавила места, остаются в пределах вместимости | 1 000 |
| 2b | Полная пересадка: на переполненном столе только закреплённые | 1 000 |
| 3 | Семья не разрывается: места рассаженных + неразмещённых = Σ мест | 1 000 |
| 4 | Столы первой категории автоматика ни с кем не делит (полная пересадка) | 1 000 |
| 4b | То же для каждой семьи, размещённой `placeIncremental` | 1 000 |
| 5 | Золотые данные — отдельный тест 5.1 | — |
| 6 | `undo(apply(x)) == x` для переноса, порядка, зала (любые размеры) и полной пересадки; `undo_skipped` не возникает | 1 000 |
| 7 | Детерминированность и чистота: два прогона на копиях дают одно и то же, замороженный вход не меняется | 1 000 |
| + | Первая настройка: пакетный `placeIncremental` = полная пересадка 6.1, если все поместились | 1 000 |

Генератор: зал 2 или 4 колонны, 1–24 стола по 4–16 мест, 1–6 категорий, до 70 семей с ответами yes/pending/no и 1–20 местами. Затем полная пересадка и до 6 случайных ручных переносов, в том числе с `force` (закрепления и переполнения).

**Проверка, что свойства ловят ошибки** (мутации, после проверки откачены):
- убрал проверку исключительности столов первой категории → упали свойства 4 и 4b. Минимальный контрпример: 1 стол на 4 места, закреплённый `c1` + автоматический `c0` за одним столом;
- разрешил `placeIncremental` двигать незакреплённых рассаженных → упало свойство 1;
- ослабил проверку свободных мест на 1 → упали свойства 2 и 2b.

**Найденные и исправленные ошибки:**
1. **`placeIncremental`, старт без предыдущих зон.** Тест «falls back to tables before the start» показал: если ни у одной предыдущей категории нет зоны, старт считался как 0, и семья садилась **перед** своей зоной, а не в неё. Исправлено: без предыдущей зоны старт = начало своей зоны.
2. **`fullReseat`, снятое закрепление.** Тест «full re-seat drops locks on removed tables» показал: если у семьи сняли закрепление (её стола больше нет), она не попадала в пересадку и оставалась неразмещённой. В прототипе `f.locked` меняется на месте, и семья пересаживается. Исправлено: список категории строится по состоянию после шага 2.
3. **`reorderCategories` → `undoChange`.** Тест показал, что после отмены массив категорий шёл в другом порядке (ранги те же). Исправлено: при смене порядка меняются только `rank`, массив остаётся прежним, и отмена даёт точно исходное состояние.
4. В трёх моих тестах `incremental` были неверные ожидания (неправильно посчитал заполненный стол; ожидал, что категория сядет за стол первой категории, а правило это запрещает). Исправлены тесты, движок не трогал. Для последнего случая добавлен отдельный тест «a non-first category never joins the first category's table, even as a last resort».

### 5.4 Покрытие `src/domain` (`pnpm exec vitest run --coverage --coverage.include='src/domain/**'`)
```
File             | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
All files        |   99.01 |    94.92 |     100 |     100 |
 guests          |     100 |    93.93 |     100 |     100 |
  duplicates.ts  |     100 |     90.9 |     100 |     100 | 55
 seating         |   98.94 |    95.03 |     100 |     100 |
  family.ts      |   97.91 |    93.02 |     100 |     100 | 9,51-63
  fullReseat.ts  |     100 |    96.77 |     100 |     100 | 101
  incremental.ts |   98.92 |    96.36 |     100 |     100 | 25,123
  occupancy.ts   |   95.65 |    77.77 |     100 |     100 | 27-31,44
  stats.ts       |     100 |    91.42 |     100 |     100 | 60,119
  undo.ts        |   97.01 |    95.45 |     100 |     100 | 43-44
Statements   : 99.01% ( 501/506 )
Branches     : 94.92% ( 318/335 )
Functions    : 100% ( 119/119 )
Lines        : 100% ( 392/392 )
```
Файлы с полным покрытием (`events.ts`, `layout.ts`, `util.ts`, `index.ts`, `types.ts`, `phone.ts`) текстовый отчёт v8 не выводит. **Строки `src/domain/seating` — 100 %** (критерий брифа). Непокрытые ветки — защитные `?? 0` и `undefined`-проверки.

### 5.5 Производительность (300 семей, 60 столов × 16, ~5 % закреплённых, детерминированный генератор, медиана 21 прогона)
```
[perf] fullReseat 300 families / 60 tables: median 0.65 ms
[perf] placeIncremental 300 families / 60 tables: median 3.08 ms
```
При прогоне с покрытием и параллельными файлами: fullReseat 4.22 ms, placeIncremental 3.65 ms. Порог в тесте — < 20 ms для обеих функций.

Первая версия `placeIncremental` при каждом размещении пересчитывала зоны по всем семьям (O(F²)) и под инструментированием покрытия показала 20,2 ms. Теперь зоны хранятся как min/max на категорию и обновляются при каждом размещении.

### 5.6 `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm check:messages`
```
$ next typegen && tsc --noEmit
✓ Types generated successfully
$ eslint --max-warnings=0
All matched files use Prettier code style!
check:messages: OK — 757 keys, kk/ru: ICU, variables, tags, select/other, ru plural forms
```
**Правило границ** на новом модуле: временный `import "react"; import "@/server/db";` в `src/domain/seating/layout.ts` →
```
  1:1  error  'react' import is restricted from being used by a pattern. src/domain is pure TS: no React (plan 11.1)               no-restricted-imports
  2:1  error  '@/server/db' import is restricted from being used by a pattern. src/domain must not import server code (plan 11.1)  no-restricted-imports
✖ 2 problems (2 errors, 0 warnings)
```
Откачено. Все импорты `src/domain` — только относительные внутри модуля. `grep -rnE "Date\.now|new Date|Math\.random" src/domain` ничего не находит.

### 5.7 e2e / build
UI и маршрутов в фазе нет. `pnpm build` и Playwright не менялись относительно Ф0 и в Ф7a не перезапускались.

## 6. Скриншоты
Не применимо (без UI).

## 7. Критерии приёмки

| Критерий брифа | Статус | Как проверено |
|---|---|---|
| 100 % строк `src/domain/seating` покрыты | **выполнен** | 5.4: Lines 100 % (392/392) |
| Нет импортов `next`, `react`, `@/server`, `@/ui`, ORM | **выполнен** | 5.6: правило границ ломает lint, grep импортов |
| Полная рассадка 300 семей на 60 столах < 20 мс | **выполнен** | 5.5: медиана 0,65 мс (4,2 мс под покрытием) |
| Золотой тест: ровно колонка «Стол» | **выполнен** | 5.1 |
| Сводные числа 150 / 23 / 173 / 19 | **выполнен** | 5.1 |
| Property-тесты ≥ 1 000 прогонов на инварианты 7.4 | **выполнен** | 5.3: 10 свойств × 1 000 |
| Крайние случаи: 18 столов в 4 колоннах, 2 колонны, пустые категории, зал уменьшили вместе с закреплёнными, рост мест → переполнение без переноса, лимит 20, 60 × 16 | **выполнен** | `edge-perf.test.ts`, `events.test.ts`, `layout.test.ts` |

Указание координатора сверх брифа:
- столы құдалар — только для автоматики, вручную можно (тест «manual move … kuda table — manual is allowed»);
- семьи не разрываются (свойство 3);
- лимит 20;
- общая фикстура;
- золотой тест;
- свойства на каждое правило;
- perf.

Всё выполнено.

## 8. Отклонения от брифа и плана

1. **Порядок фаз: Ф7a раньше Ф2** — Ф0 ждёт аккаунтов основателя, а Ф7a от них не зависит (ревью Ф0, раздел 6). Ветка `phase/F7a-seating` от `phase/F0-setup`; после мержа Ф0 — `git rebase main`.
2. **Лишний коммит в `main`:** кроме дизайна (`8713fc4`) закоммичены документы архитектора `docs/phases/Ф0-review.md` и изменённый `docs/phases/Ф2-brief.md` (`7a34cb4 docs(architecture): …`). Без этого `git rebase main` не запускался. Это ровно правило из ревью Ф0 («документы архитектора — в `main` коммитами `docs(...)`»), но отдельного указания не было. Содержимое файлов не менял.
3. **Порядок кандидатов в `placeIncremental` (уточнение 7.3).** Литерально 7.3 — это: (a) столы зоны, (b) после зоны, (c) старт после предыдущей категории, (d) до начала зоны. При таком порядке «дыры» внутри зоны (столы между min и max, где категории нет) не рассматривались бы вообще: семья могла остаться неразмещённой при свободном столе. Сделано так: просмотр **по возрастанию от начала** (`min(min Z, S)`) — это зона, её дыры, потом столы после зоны — и затем **по убыванию до начала** (d). Поэтому выполняется утверждение плана «первая настройка совпадает с алгоритмом 6.1»: оно проверено property-тестом при условии, что все поместились. Если зоны нет, старт = S (c); если нет ни зоны, ни предыдущей зоны — 0.
4. **Исключительность столов первой категории проверяется и в `fullReseat` против закреплённых семей.** Прототип полагался только на стартовую позицию (+1) и мог посадить автоматически, например, Құдалар за стол с закреплёнными чужими. Плановый инвариант 7.4.4 теперь выполняется всегда. На золотых данных результат не меняется.
5. **`Family.lockedBy?`** — поля нет в типе брифа. Добавлено для формата 5.2 (`lockedBy` в `diff`). Необязательное.
6. **`SeatingState.families` — только активные семьи.** Удалённые (`deleted_at`) сервер в состояние не передаёт. `removeFamily` возвращает `removed`, а `restoreFamily(state, removed)` возвращает семью на прежний стол, если места свободны (закрепление сохраняется), иначе вызывает `placeIncremental` (закрепление снимается).
7. **Переход «нет» → table_no = null снимает и закрепление.** В 7.2 сказано только «стулья освобождаются». Если семья потом ответит «да», её сажает `placeIncremental`; держать закрепление на столе, где её нет, бессмысленно.
8. **Ручной перенос в переполненный стол:** без `force` ничего не меняется, возвращается `move_overflow` с числом недостающих мест — это кнопка «Бәрібір ауыстыру». С `force` — переполнение и предупреждение `table_overflow`.
9. **Отмена `order`:** восстанавливается, только если текущий порядок равен `after`. Отмена `hall` — так же, сравнением конфигурации. В плане сказано «проверка `seatingVersion` только по этим полям»: сама версия — серверная (Ф2), domain сравнивает значения.
10. **Порядок семей за столом в `tableStats`:** сначала закреплённые по `seq`, потом по рангу категории, местам и `seq`. Прототип сортировал по порядку размещения (`seq`, который он переназначал). Для данных 5.2 итог совпадает с таблицей спецификации (5.1).
11. **`seq`** — стабильный порядок данных (порядок создания), движок его не переназначает. В прототипе `seq` переписывался при каждой рассадке. Для детерминированности и хранения в БД лучше неизменяемый.
12. **Фикстура в `tests/fixtures/`** (как в брифе), но Ф2 будет импортировать её из `scripts/seed.ts`. Имена категорий в фикстуре — данные сида (как ввёл бы хозяин), а не тексты интерфейса.

## 9. Самопроверка по чек-листу 13.6

- [x] Задачи фазы выполнены (раздел 2).
- [ ] Проверка на preview URL — не применимо (нет UI; GitHub/Vercel ждут основателя).
- [x] Отклонения записаны (раздел 8); изменение порядка фаз согласовано ревью Ф0.
- [x] `src/domain` без импортов `server`/`ui`/`next`/ORM; правило ESLint проверено на новом модуле.
- [x] Нет запрещённого по 4.4; новая зависимость одна (`fast-check`, dev, из плана).
- [x] Нет строк интерфейса: движок возвращает коды предупреждений (`kind`), тексты подставит UI из `content/messages`.
- [x] Миграций нет.
- [x] ПДн: движок не видит имён и телефонов (кроме `dupPairs`, которому имена нужны по смыслу); ничего не логирует.
- [x] Тесты зелёные: 123/123; золотой тест, свойства, крайние случаи, производительность.
- [x] Детерминированность и чистота проверены свойством 7.

---

## 10. Правки по ревью (`docs/phases/Ф7a-review.md`, вердикт «нужны правки»)

Коммит **`ce63240` `fix(F7a): review Д1–Д3 …`** на `phase/F7a-seating`. Перед правками ветки перебазированы на `main` (`b2ca030`, ревью + план v1.4): сначала `phase/F0-setup` на `main`, потом `phase/F7a-seating` на `phase/F0-setup`, оба раза `Successfully rebased`. Поэтому хэши прежних коммитов сменились: `feat(F7a)` теперь `a623e72`, handover — `76b3546`.

```
$ git diff --stat a623e72~0 ce63240 -- src tests   (только коммит правок)
 src/domain/seating/events.ts            |  39 ++++++------
 src/domain/seating/hall.ts              |  34 +++++++++++   (новый)
 src/domain/seating/index.ts             |   1 +
 src/domain/seating/undo.ts              |  16 ++++-
 tests/unit/seating/properties.test.ts   |  67 ++++++++++++++++++--
 tests/unit/seating/review-fixes.test.ts | 104 ++++++++++++++++++++++++++++++++  (новый)
 6 files changed, 233 insertions(+), 28 deletions(-)
```

| № | Что исправлено | Где | Тесты |
|---|---|---|---|
| **Д1** | Отмена смены зала идёт через общую функцию `applyHall(state, hall, mode)` — ту же, что использует `setupHall`. Семьи на столах, которых после отмены нет, снимаются; у закреплённых — `lock_dropped`. Затем они размещаются `placeIncremental`, переполнения дают предупреждения. При отмене (`mode = "displaced-only"`) пересаживаются **только** снятые семьи: обычная отмена без промежуточных изменений по-прежнему даёт ровно исходное состояние (свойство 6) | `hall.ts`, `undo.ts` | `review-fixes.test.ts`: сценарий ревью (2 × 4 → 4 стола → семья за столом 3 → отмена → `f3` снята, `unplaced`); закреплённая на исчезнувшем столе → `lock_dropped` и пересадка. Новое свойство **8b** (1 000 прогонов): смена зала → случайная промежуточная операция → отмена; ни одна семья не за несуществующим столом, рассаженные вне диффа не двигаются |
| **Д2** | `setupHall` при любой смене зала (`mode = "all-unseated"`) пробует посадить **всех** нерассаженных с местами > 0 — «Үстел қосу», выросшая вместимость. Рассаженных не двигает. Новый экспорт **`seatUnplaced(state)`** = `placeIncremental` по всем нерассаженным с местами (план 6.5) | `hall.ts`, `events.ts`, `index.ts` | добавлен стол → неразмещённая села за стол 3; выросла вместимость → села за стол 1; `seatUnplaced` сажает всех с местами, семьи с 0 мест не трогает, повторный вызов — без изменений. `seatUnplaced` добавлен в набор операций свойств 1, 2, 3, 7, 8 |
| **Д3** | `moveFamily` бросает `SeatingError` («… needs no seats and cannot be moved to a table»), если `seatsOf(f) === 0` — и с `force` тоже | `events.ts` | тест «throws SeatingError for «Келмейміз»». Новое свойство **8** (1 000 прогонов): после любой операции ни одна семья не сидит за несуществующим столом и ни одна семья с 0 мест не сидит за столом |
| **Д4 (найдено свойством 8b)** | Отмена могла вернуть за стол семью, которая **после** записи ответила «Келмейміз». Её стол и закрепление совпадали с `after`, но мест уже 0. Теперь такая семья не восстанавливается и попадает в `undo_skipped` | `undo.ts` | контрпример fast-check: зал 15 → 10 столов (закреплённая `f1` снята), затем `setRsvp(f1, "no")`, затем отмена → `f1` снова за столом 13 с 0 мест. Добавлен unit-тест «undo never seats a family that answered «Келмейміз» after the change» |

Вне списка ревью и после первой сдачи найден только Д4.

Генераторы свойств обновлены под Д3: ручной перенос выбирает только семьи с местами > 0.

**Контракт (дополнение к разделу 4):**
```ts
seatUnplaced(state): SeatingResult      // «Отырғызылмағандар → отырғызу», план 6.5
setupHall(state, hall)                  // теперь сажает всех нерассаженных с местами (7.2 v1.4)
moveFamily(state, familyId, to, opts)   // SeatingError, если у семьи 0 мест
undoChange(state, diff)                 // смена зала — через логику зала (7.6 v1.4)
```

**Проверки после правок (реальный вывод):**
```
$ pnpm exec vitest run tests/unit/seating/properties.test.ts   (3 раза подряд, разные seed)
      Tests  12 passed (12)
      Tests  12 passed (12)
      Tests  12 passed (12)
$ pnpm typecheck
✓ Types generated successfully
$ pnpm lint
$ eslint --max-warnings=0
$ pnpm format:check
All matched files use Prettier code style!
$ pnpm test
 Test Files  15 passed (15)
      Tests  132 passed (132)
$ pnpm exec vitest run --coverage --coverage.include='src/domain/**'
All files        |   99.03 |    94.78 |     100 |     100 |
 seating         |   98.97 |    94.87 |     100 |     100 |
  hall.ts        |     100 |    91.66 |     100 |     100 | 20
  undo.ts        |   97.18 |    95.83 |     100 |     100 | 45-46
Lines        : 100% ( 402/402 )
```
Property-тестов теперь 12 × 1 000 = **12 000** прогонов. Золотой тест и производительность не изменились, оба в зелёном прогоне выше.
