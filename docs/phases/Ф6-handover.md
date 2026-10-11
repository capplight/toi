# Ф6 · Итоги — пакет сдачи

Версия 1.0 · 2026-10-11 · full-stack разработчик (агент) → архитектор
Бриф: `docs/phases/Ф6-brief.md` v1.0. План v1.9: 5.1, 6.2, 7.5, 12.3 Ф6. Дизайн: `DESIGN_v2.md` 8.19; `design_spec.md` 5.2, 6.2. Решение А4.

**Статус:** бриф сделан полностью, аккаунты не нужны. Критерии 1–5 проверены (раздел 6).

Ветка `phase/F6-summary` от `phase/F5-invitation` после правок ревью Ф5 (`ab7e5a5`).

---

## 1. Что сделано

### 1.1 Данные — `summaryView(db, who, eventId, { locale })`, `src/server/summary/queries.ts`
Один серверный запрос-сборка. Доступ — `authorize(…, "member")`: чужой получает `ForbiddenError` (403), страница — 404, как во всех рабочих экранах. Своих формул нет, всё считают функции домена:

| Блок | Источник |
|---|---|
| «Мейрамханаға: N адам → M үстел» | `totals(state)`: N = `toSeat`, M = `usedTables` (занятые столы, из `tableStats`). Без зала `tables = null` |
| «Келеді · семьи · места» | `listTotals` (семьи) + `totals.confirmed` |
| «Жауап жоқ · семьи · ~места» | `listTotals.noAnswer + notSent` (**А4: включая не отправленных**), места — `totals.expected`; `notSent` отдельно для подписи `summary.tiles.pendingNotSent` |
| «Келмейді · семьи» | `listTotals.no` |
| По категориям | `plannedSeats` по категории, порядок — ранг рассадки, категории без мест не показываются. Сумма = N |
| Воронка (только хозяин) | семьи с `sent_at` / `first_opened_at` / `responded_at`. В «ответили» входят и ответы по телефону. Для остальных — `null` |
| По спискам | составители (не удалённые) по `invited_at`: подпись из `roles.*` (для «своих» видов) + имя (`display_name`, иначе `users.name` — как на экране составителей Ф3); семьи и `plannedSeats` |
| «Шығындар» | `budget = owner || can_manage_budget` (то же правило, что `requireBudget`) |
| `version` | `events.seating_version` — для опроса |

Сверка с `design_spec` 5.2 на сиде (integration): 173 → 15; 53 семьи / 150 мест; 9 семей / ~23 места, из них 2 не отправлены; 3 семьи «Келмейді»; категории в сумме 173 (Құдалар 28); списки в сумме 65 семей и 173 места; ответили 56.

### 1.2 Экран — `src/app/e/[eventId]/summary/page.tsx` (DESIGN 8.19)
- **360:**
  - компактная шапка события (`EventHero compact="phone"`);
  - главное число в карточке lapis-soft: числа 40 px, остальной текст 20 px; строка целиком из `summary.restaurant`, для чтения с экрана — `aria-label` из `summary.restaurantA11y`; под ней `summary.restaurantHint`;
  - три плитки в ряд; на 320 px и при 130 % переносятся на 2 + 1, как счётчики S1;
  - «Санаттар бойынша»: ромб цвета категории, «{category} · {seats} орын», полоса доли (`ProgressBar`); круговых диаграмм нет;
  - «Шақырулар»: три полосы и подсказка `summary.funnel.hint`;
  - «Тізімдер бойынша» (`LinkRows`/`LinkRow`, как «Басқа тізімдер» Ф4, ссылки `/guests?list=`);
  - карточка «Шығындар».
- **Десктоп ≥ 1024:** 12-колоночная сетка. Главное число (5 колонок) и три плитки (7) в ряд; ниже категории (7) | воронка и списки (5). «Шығындар» на десктопе — в боковом меню (Ф1), карточка только на телефоне.
- **Пустое событие** — `EmptyState` с `summary.empty`. Без зала — «N адам» и ссылка «Залды баптау» на `/hall` (отклонение 1).
- Стили — блок «Қорытынды» в конце `src/ui/components.css`, только токены.

### 1.3 Обновление — опрос версии (план 7.5)
- Страница рендерится на сервере при каждом заходе (`force-dynamic` из layout).
- `src/ui/components/VersionPoll.tsx` (клиентский, ничего не рисует):
  - пока вкладка видна, раз в 15 с запрашивает `GET /api/e/[eventId]/version` (новый route, `requireUser` + `authorize member`, `no-store`; 401/403);
  - если версия изменилась — `router.refresh()`;
  - при возвращении на вкладку — сразу проверка, на скрытой вкладке таймер стоит.
- Версия растёт на любом изменении рассадки и ответов (правило П1 Ф4). Поэтому ответ гостя через `/i/{token}` доходит до экрана: проверено e2e и integration.

### 1.4 Сид
`scripts/lib/seed-sample.ts`: составителям проставлено `display_name` из фикстуры (Серік, Гүлжан, «Айбек, Дана» — `design_spec` 5.2). Теперь «Әкесі · Серік» на итогах и имена на экране составителей Ф3.

## 2. Файлы
- Новые:
  - `src/server/summary/queries.ts` (`summaryView`, `seatingVersion`);
  - `src/app/api/e/[eventId]/version/route.ts`;
  - `src/ui/components/VersionPoll.tsx`;
  - `tests/integration/summary.test.ts`;
  - `tests/e2e/summary.spec.ts`;
  - `tests/e2e/screens-f6.spec.ts`;
  - `docs/phases/F6-screens/` (10).
- Изменены:
  - `src/app/e/[eventId]/summary/page.tsx` — была заглушка Ф1;
  - `src/ui/components.css`;
  - `scripts/lib/seed-sample.ts`;
  - `tests/e2e/global-setup.ts` — `E2E_PRISTINE_SEED`, отклонение 6.
- Зависимостей, системных пакетов и ключей `content/messages` не добавлено.

## 3. Проверки — реальный вывод
```
$ pnpm check:messages
check:messages: OK — 778 keys, kk/ru: ICU, variables, tags, select/other, ru plural forms
check:presets: OK — 16 texts, 6 kinds × kk/ru, no samples, variables or markup
$ pnpm typecheck && pnpm lint && pnpm format:check
✓ Types generated successfully · eslint --max-warnings=0 (0) · All matched files use Prettier code style!
$ pnpm test
      Tests  169 passed (169)
$ pnpm test:integration                  (PGlite)
 Test Files  10 passed | 1 skipped (11)
      Tests  104 passed | 2 skipped (106)  (+5 tests/integration/summary.test.ts)
$ pnpm build                             ✓  (ƒ /e/[eventId]/summary, ƒ /api/e/[eventId]/version)
$ … playwright test tests/e2e/summary.spec.ts tests/e2e/shell.spec.ts --workers=1
  18 passed (1.9m)
$ … playwright test --workers=1          (весь набор, mobile + desktop + small)
# прогон 1: 4 failed · 18 skipped · 139 passed (11.3m)
#   summary.spec (mobile, desktop) × 2: «оның ішінде жіберілмеген: 3/4» вместо 2 — guests.spec раньше добавляет
#   неотправленных гостей. Точное «2» — число сида, его проверяет integration; e2e теперь проверяет формат.
# прогон 2: 3 failed · 18 skipped · 140 passed (8.0m)
#   summary.spec (mobile, desktop): списков 5 и 7 вместо 3 — events.spec (Ф3) раньше добавляет составителей.
#   Исправлено: проверяются три списка сида на своих местах, а не общее число.
#   guests-perf (mobile, Ф4): S1 interactive (CPU ×4): first uncached 2233 ms; warm runs 1327, 1442, 1504, 1528,
#   1817 ms; frame «Зал» 419 ms; S1/frame 3.59 — каркас < 0,5 с, поэтому проверка строгая, и S1 1504 мс > 1000.
#   Ф6 S1 не меняет. Отмечаю отдельно (см. раздел 5, п. 9).
$ … playwright test tests/e2e/events.spec.ts tests/e2e/invite.spec.ts tests/e2e/summary.spec.ts --workers=1
  38 passed (2.9m)       (после исправления: summary идёт после спецификаций, которые меняют данные)
$ SCREENSHOTS=1 E2E_PRISTINE_SEED=1 … playwright test tests/e2e/screens-f6.spec.ts --project=desktop
  1 passed (44.2s)
$ gitleaks protect --staged → no leaks found
```

Integration `summary.test.ts`:
1. сид = `design_spec` 5.2 (числа выше), воронка и списки у хозяина;
2. ru-подписи, «Жастар»: без воронки и без «Шығындар»;
3. чужой: 403 на итоги и на версию;
4. без зала → `tables: null`; пустое событие → `empty`, нули;
5. ответ гостя → версия + 1, плитки, N и «ответили» меняются.

E2E `summary.spec.ts` (mobile 360 и desktop 1440):
1. хозяин kk: строка ресторана и `aria-label`, три плитки, «оның ішінде жіберілмеген: 2», категории, воронка с подсказкой, 3 списка (переход в чужой список), «Шығындар» на телефоне и не на десктопе;
2. «Жастар» ru: формы множественного числа, нет воронки, нет «Расходы»;
3. ответ гостя через `/i/{token}` в другом контексте → «Келмейді» +1 после опроса, ожидание ≤ 25 с;
4. axe без serious/critical; 130 % без горизонтальной прокрутки; 320 px (и при 130 %) без прокрутки, все ссылки ≥ 48 px.

## 4. Скриншоты — `docs/phases/F6-screens/`
Сделаны на сиде, как в `design_spec` 5.2 (`E2E_PRISTINE_SEED=1`):
- `01` и `02` — хозяин kk, 360 (вся страница и первый экран);
- `03` — хозяин ru, 360;
- `04` / `05` — хозяин kk / ru, 1440;
- `06` — «Жастар» kk, 360;
- `07` — «Жастар» ru, 1440;
- `08` — 360 при 130 %;
- `09` — 320;
- `10` — 768.

На снимках всей страницы нижняя панель вкладок попадает в середину картинки — так Playwright склеивает `fullPage` с фиксированной панелью; в браузере она внизу. Отдельного макета 8.19 нет, сверка по описанию.

## 5. Отклонения
1. **Без зала — «N адам» без слова «Мейрамханаға».** Ключа «Мейрамханаға: {people} адам» без столов нет. Показано `common.units.people` («173 адам»), подсказка `summary.restaurantHint` и ссылка «Залды баптау» (`hall.setup.title`) на `/hall`. **Контент-лиду:** при желании — ключ `summary.restaurantNoHall`.
2. **«Шығындар» без сумм.** `summary.budgetLink` (`{paid}/{total}`) до Ф9 не используется: карточка-ссылка с `nav.budget` на заглушку `/budget`, как в брифе. На десктопе вход — боковое меню (Ф1), карточка только на телефоне (DESIGN 8.19 «вход в расходы на телефоне»).
3. **Плитки — не `CounterTile`.** `CounterTile` Ф1 — кнопка-фильтр с `aria-pressed`. На итогах плитки не нажимаются, поэтому здесь статичный блок того же вида (`.sum-tile`). `ProgressBar`, `LinkRows`, `EventHero` — из Ф1. Строка плитки берётся целиком из сообщения и делится на строки по « · » (оба языка так устроены). Цифры крупнее, текст не собирается из кусков.
4. **Масштаб полос.** Категории — доля от N (сумма полос = 100 %). Воронка — доля от всех семей события.
5. **«Ашты: 0» на сиде.** В сиде нет `first_opened_at`, а в 8.19 пример «Ашты 55». Сид не менял: открытия появляются от реальных гостей (пинг Ф5). Отправлено на сиде 63, ответили 56.
6. **`E2E_PRISTINE_SEED=1`** в `global-setup` — только для скриншотов. Он не сбрасывает 32 семьи в «pending» (Ф5), и итоги совпадают с `design_spec` 5.2. С этим флагом тесты страницы гостя не запускать. Поэтому в обычном e2e точные числа сида не проверяются (их проверяет integration), а e2e проверяет вид и формат.
7. **Опрос ловит только `seating_version`.** «Жіберілді» и «Ашты» версию не меняют (это не рассадка): эти два числа обновятся при следующем заходе или вместе с любым ответом или изменением рассадки. Так и в брифе: опрос — по `seating_version`.
8. **`summary.tableQueueEntry`** («Үстел нөмірлерін жіберу») не используется — это вход Ф8.
9. **`guests-perf` (Ф4) во втором полном прогоне упал по правилу калибровки.** Каркас «Зал» 419 мс — машина «не перегружена», а S1 — 1504 мс (S1 / каркас 3,59). В первом прогоне каркас был 707 мс, тест только записал цифры. Ф6 экран S1 не трогает. Значит, порог 0,5 с для каркаса на этой машине пропускает случаи, когда S1 всё ещё в 3–4 раза медленнее каркаса. Это вопрос к РА: CI на Linux и реальный Android. Порог я не менял.

## 6. Критерии приёмки
1. Числа = `design_spec` 5.2, считаются функциями домена — ✓ (integration 1, раздел 1.1).
2. «Жауап жоқ» включает не отправленных и показывает «Оның ішінде жіберілмеген: N» (А4) — ✓ (integration 1, e2e 1–2, скриншоты).
3. Воронка только хозяину — ✓ (integration 2, e2e 2).
4. Экран по 8.19; axe, 130 %, 320 px — ✓ (e2e 4, скриншоты 01–10).
5. Все проверки зелёные — ✓ для Ф6 (раздел 3). Исключение — `guests-perf` Ф4 (отклонение 9).

## 7. Самопроверка
- [x] Тексты только из `content/messages`; новых ключей нет.
- [x] Свои формулы не добавлены — `totals`, `listTotals`, `plannedSeats`.
- [x] Доступ на сервере (`authorize`), в том числе у маршрута версии.
- [x] Секретов нет; `SMS_PROVIDER=console`; системные пакеты не ставились.
- [x] Серверы, запущенные для проверок (standalone, PGlite), остановлены.
