# Ф8 · Номер стола и помощник на входе — пакет сдачи

Версия 1.0 · 2026-10-16 · full-stack разработчик (агент) → архитектор
Бриф: `docs/phases/Ф8-brief.md` v1.0. Дизайн: DESIGN 8.17 п. 6, 8.18, 8.21; макеты `07-invite-kyzgaldak.html#table`, `08-door.html`, `12-table-queue.html`, блок «Кіреберіс сілтемесі» в `11-members.html`.

Ветка — **`phase/F8-door`**: от `phase/RA-prep` после правок ревью РА, затем перебазирована на **`phase/F7b-hall`** (`935afef`). Порядок мержа: RA → Ф7b → Ф8.
- Ф7b основана на RA `7f4ef7d`, без двух последних коммитов RA (`614b683` — правки спек скриншотов, `5dfa8c5` — документы и скриншоты RA). Поэтому при перебазировании они переигрались вместе с Ф8 (здесь `f1c770e`, `56f02f6`). При мерже RA первой они совпадут.
- Конфликты — только в `tests/e2e/worlds.ts` и `global-setup.ts` (миры Ф7b и Ф8), решены объединением.
- Схема телефонов миров: у Ф7b — `+7700{i}…` / `+7701{i−10}…`, у меня — `+770{nn}…`. Номера совпадают; оставлена одна формула.

**Статус:** код Ф8 готов. Integration и e2e Ф8 прошли. Полный прогон, скриншоты и одна открытая проверка (B1 Ф7b) — у тест-раннера, раздел 6. По новому правилу основателя полные наборы я больше не запускаю.

---

## 1. Номер стола

- **Миграция `0005_show_table_numbers.sql`** (расширяющая):
  ```sql
  ALTER TABLE "events" ADD COLUMN "show_table_numbers" boolean DEFAULT false NOT NULL;
  ```
  Номер взят следующим после Ф7b: у Ф7b миграций нет, последняя — `0004`.
- **Переключатель хозяина** «Үстел нөмірін көрсету» (`settings.showTableNo`) на «Баптаулар»:
  - `SettingsTableNumbers.tsx` — стиль `sw-row` / `switch`, как у прав составителя Ф3;
  - `setShowTableNumbersAction` → `setShowTableNumbers` (только хозяин, `authorize owner`);
  - тост `settings.saved`.
- **Страница гостя** (тегированные строки Ф5) — блок `#table` «Сіздің үстеліңіз» после ответа, только при включённом флаге и если семья не «Келмейді»:
  - номер (Cormorant, классы макета `.tableno .n` / `.unit`) и уголки шаблона;
  - **мини-схема на сервере** (`src/server/invite/minimap.ts`): SVG из `layoutTables`, те же номера и колонки, что в «Зал»:
    - ТӨР, стол молодых (`.yt`), кружки столов;
    - свой стол залит акцентом с пульсирующим кольцом (`ping`; при reduced motion — без анимации, CSS макета);
    - «Сіз осында», КІРЕБЕРІС;
    - `role="img"`, `aria-label` из `invite.table.mapA11y`;
    - **без имён соседей** (integration проверяет, что ни одно чужое имя не попало в блок);
    - для 60 столов ≤ 4 КБ (unit на размер);
  - `invite.table.hint` — только если ссылку помощника уже открывали (`activity_log.kind = 'door_opened'` пишется при первом снимке);
  - нет стола → `invite.table.notYet`.

  Классы состояний макета (`.st-table`) на настоящей странице не используются: их CSS прячет блок вне режима демо. Несколько своих правил — `TABLE_CSS` в `render.ts`.
- **Очередь «Үстел нөмірлерін жіберу»** `/e/[eventId]/table-queue` (`TableQueue.tsx`, `src/server/tableQueue/service.ts`):
  - доступ — хозяин и составители с правом рассадки (`authorize seating`), остальным 404;
  - очередь — семьи со столом (не «Келмейді»), по номеру стола, затем по имени (казахская сортировка). Неотсаженные — `tableQueue.notSeatedNote` с числом;
  - сверху «N / M» и полоса; карточка: имя, «10-үстел», телефон, предпросмотр текста `wa.tableNumber` (ссылка гостя с `#table`);
  - «WhatsApp-қа жіберу» → `location.assign(wa.me…)` (ревью Ф3);
  - после возврата — «Жіберілді» (`table_sent_at`, без вопроса «Жіберілді ме?», решение 3.2) или «Өткізіп жіберу»;
  - «Тоқтату»; при следующем заходе — «Тоқтаған жерден жалғастыру (№N)»;
  - все отправлены → `tableQueue.allSent` + «Басынан бастау» (сброс `table_sent_at`) и «Қорытындыға оралу»;
  - семья без телефона → `tableQueue.current.noPhone`, только «Өткізіп жіберу»;
  - десктоп: список очереди со статусами слева, карточка справа.
  - **Возврат из WhatsApp.** `location.assign` уходит со страницы. Какая семья была открыта и кого пропустили, хранится в `sessionStorage`. Читается через `useSyncExternalStore` (без расхождения гидратации), так что после возврата сразу видна та же карточка с «Жіберілді».
- **Вход в очередь** — `summary.tableQueueEntry` на «Қорытынды»: у хозяина и составителей с правом рассадки, если зал настроен (отклонение 3).

## 2. Помощник на входе `/d/{doorToken}`

- **Сервер** (`src/server/door/service.ts`, маршруты `src/app/api/door/[token]/…`):
  - `GET …/snapshot` → `{ event: { title, startsOn, startsAt }, families: [{ id, name, tableNo, seats, categoryLabel, categoryCode, rsvp, arrivedAt }], generatedAt }`:
    - **без телефонов**, `no-store`;
    - подписи категорий на языке cookie;
    - первый снимок пишет `door_opened` (подсказка на странице гостя);
  - `POST …/checkins` → `{ deviceId, ops: [{ opId, familyId, arrived, clientAt }] }` (zod; ≤ 200 операций):
    - идемпотентно по `opId` (`on conflict do nothing`);
    - для каждой семьи побеждает последний `clientAt` (при равенстве — полученный позже);
    - пишет `door_checkins` и `families.arrived_at`;
    - ответ — текущие отметки события;
    - семьи чужого события игнорируются;
  - лимит **600 операций в час на токен** (`rate_limits`, ключ по `sha256(token)`) → 429;
  - неизвестный или отозванный токен → **404**.
- **Клиент** (`src/app/d/[token]/DoorApp.tsx`):
  - без вкладок и меню, крупно и контрастно, стили — свой файл `src/ui/door.css`;
  - **IndexedDB** (`idb`): база на токен, `kv.snapshot` и `outbox`;
  - поиск на устройстве (`search.ts`): нижний регистр, `ё → е`, начало любого слова, от 2 букв, подсветка совпадения (`<mark>`, подчёркивание как в макете);
  - «Келді» → `outbox` + мгновенное обновление; «Белгіні алу»; тост **сверху** на 4 с с «Қайтару» (`common.actions.undo`);
  - синхронизация: при `online`, раз в 30 с и при открытии. Снимок тихо обновляется, если старше 2 ч и есть сеть. Отметки сервера применяются, кроме семей, у которых в `outbox` ещё есть операции этого устройства;
  - индикатор: «Тізім телефонға сақталды · N адам · время» / «Интернет жоқ · әлі жіберілмеді: N» / «Белгілер жіберілуде…»;
  - `door.saveHint` после первой загрузки;
  - первое открытие без сети → `door.status.firstLoadNeedsNet`; отозванная ссылка → `door.status.linkRevoked`. Страница всегда отвечает 200, чтобы её можно было закэшировать;
  - «Келді: 64 / 173 адам» и полоса; на десктопе справа «Соңғы келгендер»;
  - круг с номером стола 76 px в оттенке категории.
- **Офлайн-оболочка** — свой service worker `public/d/sw.js`, scope `/d/` (остальной сайт без SW; отклонение 1):
  - страница — сначала сеть, без сети — кэш;
  - `/_next/static`, `/fonts`, `/icons.svg` — сначала кэш;
  - `/api/*` не кэшируется;
  - после первой загрузки страница передаёт SW всё, что уже загрузила (`performance` + путь): эти запросы были до того, как SW взял страницу под контроль;
  - Background Sync не используется (iOS).
- **«Кіреберіс сілтемесі» у составителей**:
  - флаг `NEXT_PUBLIC_FEATURE_DOOR` убран, блок виден хозяину всегда;
  - «WhatsApp-қа жіберу» — готовая ссылка wa.me с текстом `wa.doorLink`, собирается на сервере;
  - «Жаңа сілтеме» → `rotateDoorToken` (Ф3): после него старая ссылка — 404, на устройствах помощника — `door.status.linkRevoked`.

## 3. Файлы

- **Новые:**
  - `db/migrations/0005_show_table_numbers.sql` (+ meta);
  - `src/server/door/service.ts`, `src/app/api/door/[token]/{snapshot,checkins}/route.ts`;
  - `src/app/d/[token]/{page.tsx, DoorApp.tsx, search.ts}`, `public/d/sw.js`, `src/ui/door.css`;
  - `src/server/tableQueue/service.ts`, `src/server/actions/tableQueue.ts`, `src/app/e/[eventId]/table-queue/{page,layout,TableQueue}.tsx`, `src/ui/queue.css`;
  - `src/server/invite/minimap.ts`, `src/domain/guests/wa-table.ts`;
  - `src/app/e/[eventId]/settings/SettingsTableNumbers.tsx`;
  - тесты: `tests/integration/door.test.ts`, `tests/e2e/door.spec.ts`, `tests/e2e/screens-f8.spec.ts`.
- **Изменены:**
  - `schema.ts` (`showTableNumbers`);
  - `invite/guest.ts` (`table`), `invite/render.ts` (блок `#table`), `invite/preview.ts`;
  - `settings/page.tsx` и `settings/layout.tsx` (сообщения);
  - `settings/members/{page,MembersScreen}.tsx` (ссылка помощника);
  - `summary/queries.ts` (`canSeat`), `summary/page.tsx` (вход в очередь);
  - `src/i18n/client-messages.tsx` (`RouteMessagesOnly` для страниц вне рамки события);
  - e2e: `worlds.ts`, `global-setup.ts` (миры `door`, `queue`, `doorToken`, телефоны `+770{nn}…`).
- **Не трогал** (по брифу): `src/ui/hall/*`, `undo.ts`, адаптер рассадки, `EventShell`. Стили — свои файлы.
- **Зависимость:** `idb@8.0.4` (IndexedDB, по брифу). Других нет. Системных пакетов не ставил.

## 4. Проверки, которые я запускал (точечно)
```
$ pnpm typecheck && pnpm lint && pnpm format:check          → чисто
$ pnpm check:messages → OK — 804 keys … · check:presets OK · check:legal OK (WARNING 34 × [ЮРИСТ …])
$ pnpm test                → Test Files 25 passed · Tests 181 passed
$ pnpm test:integration    → Test Files 12 passed | 1 skipped · Tests 134 passed | 2 skipped   (после rebase на Ф7b)
  в т. ч. tests/integration/door.test.ts — 9 passed:
    снимок без телефонов + door_opened; 404 на неизвестный / отозванный токен;
    идемпотентность opId, снятие отметки; два устройства в любом порядке синхронизации → побеждает поздний clientAt;
    чужие семьи игнорируются; лимит 600/ч → rateLimited;
    очередь: порядок, продолжение, «Басынан бастау»; «Жастар» → 403; флаг меняет только хозяин;
    страница гостя: флаг выключен → блока нет; включён → номер, мини-схема, без чужих имён; подсказка после открытия
    ссылки помощника; без стола → «әлі белгіленбеген»; мини-схема: кружки, свой стол, ≤ 4 КБ на 60 столов
$ pnpm exec playwright test tests/e2e/door.spec.ts --workers=1   (до rebase на Ф7b)
  8 passed · 4 skipped   (пропуски — сценарии одного устройства идут в одном проекте: офлайн и очередь — mobile,
                           «два устройства» — desktop; так задумано, мир общий для проектов)
```
**Полный прогон на итоговом коде (до нового правила, после rebase на Ф7b)** — машина была перегружена (каркас «Зал» 1101 мс):
```
  1 failed · 28 skipped · 175 passed (9.8m)
  failed: [desktop] hall.spec.ts:276 «Ф7b hall: B1 … ТӨР and the first row visible without scrolling (360 and 320)» —
          table 1 at 320: 575.7 > 504
```
- **Это тест Ф7b, и на чистой `phase/F7b-hall` он проходит.** Проверено: тот же `hall.spec.ts` на `935afef` — 16 passed. На Ф8 он падает и отдельно (`hall.spec.ts` — 15 passed, 1 failed).
- Что исключено:
  - код Ф8 не трогает зал;
  - `door.css` и `queue.css` подключаются только маршрутами `/d/[token]` и `/table-queue` (проверено по `page_client-reference-manifest.js` сборки), на «Зал» их нет;
  - телефоны миров совпадают с Ф7b.
- В снимке страницы при падении виден десктопный заголовок «Зал» (`4 қатар · 14 үстел`) на ширине 320 в проекте desktop. Он сдвигает схему вниз.
- **Причина не найдена.** Передаю тест-раннеру (раздел 6, п. 3) и dev2: сравнить трассу `test-results/hall-…-desktop/trace.zip` на обеих ветках.

## 5. Инцидент: удалён `node_modules` основного дерева (восстановлен)

- **Что делал.** Чтобы проверить `hall.spec` на чистой Ф7b, сделал временный worktree в scratchpad и подключил ему `node_modules` основного дерева через **junction** (Turbopack такую ссылку не принял).
- **Что случилось.** `git worktree remove --force` при удалении пошёл **внутрь junction** и удалил содержимое `D:/My Project/toi/node_modules`: остались только `.bin` и `.modules.yaml`.
- **Что затронуто.** Только `node_modules` основного дерева. `.env.local` и `.pglite/` основателя на месте. Ворктри Ф7b/Ф9 dev2 (`D:/My Project/toi-f7b`) — отдельная копия, не затронута.
- **Восстановление.** `pnpm install --frozen-lockfile` на `phase/F8-door` — из хранилища pnpm за 5,6 с.
  - `ffmpeg-static` при восстановлении: бинарник на месте (`node_modules/.pnpm/ffmpeg-static@5.3.0…/ffmpeg.exe`, `existsSync = true`), повторная загрузка не понадобилась.
  - После этого сборка, typecheck и тесты проходили.
- **Вывод.** Junction в worktree с последующим `worktree remove --force` больше не использую. Для проверки другой ветки — `git checkout` в основном дереве при чистом состоянии (так и сделал дальше).

## 6. Проверки — ожидают тест-раннера

По правилу основателя полные наборы и скриншоты запускает отдельный агент.

**Где и как:**
- Дерево — `D:/My Project/toi`, ветка `phase/F8-door` (последний коммит). Ворктри dev2 `D:/My Project/toi-f7b` не трогать.
- Порты: приложение **3100**, PGlite **5435**. Ворктри dev2 использует 3300 / 3400 / 5533–5535.
- Не трогать `.env.local` и `.pglite/` основателя: e2e берёт свои переменные.

**Подготовка:**
1. База в памяти, в отдельном терминале:
   ```
   pnpm db:local --memory --port 5435
   ```
2. Сборка — **из PowerShell**, с переменными из скрипта dev-env:
   - `DATABASE_DRIVER=pg`;
   - `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5435/postgres?sslmode=disable`;
   - `APP_URL=http://localhost:3100`, `APP_DOMAIN=toi-pilot.vercel.app`;
   - `SESSION_SECRET` / `OTP_HMAC_SECRET` / `CRON_SECRET` — случайные, **каждый не короче 32 символов** (иначе `env.ts` не даёт стартовать серверу; так один раз упал запуск webServer у тест-раннера). В PowerShell, например:
     ```
     foreach ($v in "SESSION_SECRET","OTP_HMAC_SECRET","CRON_SECRET") { Set-Item "env:$v" ([Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))) }
     ```
     (32 случайных байта → 44 символа base64);
   - `SMS_PROVIDER=console`.
   ```
   pnpm build
   ```
3. Окружение для e2e (Playwright сам поднимет standalone на 3100):
   ```
   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5435/postgres?sslmode=disable
   E2E_CHANNEL=chrome
   ```

**Что запустить** (каждый пункт — вывод целиком в отчёт):

1. Статика и тесты:
   ```
   pnpm check:messages; pnpm typecheck; pnpm lint; pnpm format:check
   pnpm test
   pnpm test:integration
   ```
2. **Полный последовательный e2e** (mobile + desktop + small):
   ```
   pnpm exec playwright test --workers=1
   ```
   Строку `S1 interactive …` — в отчёт.
3. **Открытый вопрос B1 Ф7b** (раздел 4):
   ```
   pnpm exec playwright test tests/e2e/hall.spec.ts --project=desktop --workers=1 -g "B1"
   ```
   - на `phase/F8-door`;
   - затем на `phase/F7b-hall`: `git checkout phase/F7b-hall` → сборка → тот же тест → обратно `git checkout phase/F8-door`;
   - если падает только на Ф8 — приложить трассу (`--trace on`).
4. **Скриншоты Ф8** (по одной спеке):
   ```
   SCREENSHOTS=1 pnpm exec playwright test tests/e2e/screens-f8.spec.ts --project=desktop --workers=1
   ```
   - результат → `docs/phases/F8-screens/`;
   - для набора релиза с 320 px: `SCREENSHOTS=1 SCREENS_OUT=docs/phases/RA-screens …` (тогда → `RA-screens/F8/`);
   - что снимается: помощник (сохранено, поиск, «Келді» + тост, офлайн, не найдено, первое открытие без сети, отозванная ссылка), блок стола на странице гостя × 3 шаблона, очередь (старт, карточка, все отправлены), «Баптаулар» с переключателем, составители с «Кіреберіс сілтемесі»; kk / ru; 360 / 1440 (+320).
5. Повтор S1 (ворота релиза A, ревью Ф6):
   ```
   pnpm exec playwright test tests/e2e/guests-perf.spec.ts --project=mobile --repeat-each=3 --workers=1 --retries=0
   ```
6. После всего — **остановить** standalone (3100) и PGlite (5435).

## 7. Отклонения

1. **Service worker без Serwist.** `@serwist/next` встраивается через webpack, а сборка проекта — Turbopack (Next 16). Поэтому свой SW на ~80 строк в `public/d/sw.js` с тем же поведением, что требует бриф: только scope `/d/`, оболочка в кэше, API не кэшируется, без Background Sync.
   - Предкэш — не списком на этапе сборки (имена чанков Turbopack с хэшами), а тем, что страница реально загрузила при первом открытии.
   - Проверено e2e: перезагрузка без сети отдаёт страницу и данные.
2. **Пункт меню хозяина «Үстел нөмірлерін жіберу» не добавлен**: бриф и ревью запрещают трогать `EventShell`. Вход — с «Қорытынды» (`summary.tableQueueEntry`). Пункт меню — после мержа Ф7b, отдельной правкой рамки (dev2 или следующая фаза).
3. Вход в очередь на «Қорытынды» показывается, только если **зал настроен**: без зала номеров столов нет.
4. **«Жаңа сілтеме» помощника — без диалога подтверждения** (`members.door.rotateConfirm` есть в текстах): кнопка работает как в Ф3. Добавить диалог — небольшая правка в `MembersScreen`, вне рамок брифа Ф8.
5. **Пропущенные в очереди** — на этом устройстве в этой сессии (`sessionStorage`). Сервер знает только `table_sent_at`, как в брифе. «Продолжить» указывает на первую неотправленную и не пропущенную семью.
6. На странице помощника **нет переключателя языка** (в макете — меню «Той мәзірі»): язык — из cookie, как у всего интерфейса. Бриф: «без вкладок и меню».
7. Мини-схема рисует стол молодых прямоугольником без подписи (как макет G18). Подпись `hall.map.coupleTable` не выводится, чтобы уложиться в 4 КБ и не перегружать схему.
8. При перебазировании на Ф7b в ветку попали два последних коммита RA (см. начало). При мерже по порядку RA → Ф7b → Ф8 они совпадут с RA.

## 8. Что ждёт аккаунтов
- Помощник в **режиме полёта** на реальном Android и iPhone (Safari, «На экран Домой» не обязателен): первое открытие с сетью → офлайн → поиск, «Келді» → сеть → отметки на сервере.
- Очередь на iPhone: `location.assign` в WhatsApp и возврат (бриф Ф3).
- Превью ссылки гостя с `#table` в WhatsApp.

## 9. Самопроверка
- [x] Тексты только из `content/messages` (`tableQueue.*`, `door.*`, `invite.table.*`, `settings.showTableNo`, `wa.tableNumber`, `wa.doorLink`); новых ключей не добавлял.
- [x] Снимок помощника без телефонов; доступ по токену, отозванный — 404; лимит.
- [x] `src/ui/hall/*`, `undo.ts`, адаптер рассадки, `EventShell` не тронуты; стили Ф8 — в своих файлах.
- [x] Секретов нет; `.env.local` и `.pglite/` не тронуты и не закоммичены.
- [x] Серверы, запущенные мной (PGlite 5435, standalone 3100), остановлены.

## 10. После прогона тест-раннера (2026-10-16)

Результат тест-раннера на `ce9ca33`:
- сборка ✓; check:messages, typecheck, lint, format ✓;
- unit 181 / 0; integration 134 passed / 2 skipped;
- **полный последовательный e2e: 176 passed / 30 skipped / 0 failed** (машина перегружена, perf только записан);
- `guests-perf --repeat-each=3` прошёл (медианы 4,3 / 5,5 / 4,6 с, не проверялись из-за нагрузки).

Исправлено точечно:
- **`screens-f8.spec.ts:67`.** Во втором размере карточка «Ерлан ағай отбасы» уже была отмечена в первом: «Келді» на сервере, кнопка стала «Белгіні алу». Теперь каждый проход начинается с одинакового состояния: очищаются `door_checkins` события (они решают, какая отметка последняя), «Келді» остаётся только у «Ербол нағашы отбасы». Спека — 1 passed (1,4 мин), **51 скриншот** в `docs/phases/F8-screens/`.
- **Мини-схема.** Когда свой стол в последнем ряду, «Сіз осында» налезала на «КІРЕБЕРІС» (видно на снимке `G-table_*`). Под последним рядом добавлено место (+17 px); integration `door.test.ts` — 9 passed; снимки пересняты.
- **Секреты в командах тест-раннера** (раздел 6): каждый не короче 32 символов — так требует `env.ts`, — плюс команда PowerShell для генерации.

**Открыто:** B1 «Зал» на Ф8. Причина — ошибка сервера в представлении рассадки Ф7b (`bind message supplies 1 parameters, but prepared statement requires 2` из `queryWithCache`; есть и в логах `phase/F7b-hall`). Исправляет dev2 на `phase/F7b-hall`; после этого Ф8 перебазируется на исправленную ветку.
