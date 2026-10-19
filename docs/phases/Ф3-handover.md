# Ф3 · Событие, составители, ссылки входа — пакет сдачи

Версия 1.0 · 2026-10-11 · full-stack разработчик (агент) → архитектор
Бриф: `docs/phases/Ф3-brief.md` v1.0. Дизайн: `design/DESIGN_v2.md` v2.3, 8.14–8.16 и 17.2, макеты `10-wizard.html`, `11-members.html`, `09-join-login.html#switch`. План v1.7: 5, 5.3, 6.1, 6.2, 12.3 Ф3, 13.5–13.6.

**Статус:** задачи брифа 3.1–3.3 выполнены, критерии 1–8 проверены локально (раздел 7). Аккаунты не нужны.

---

## 1. Ссылки

| Что | Где |
|---|---|
| Ветка | `phase/F3-event-members` от `phase/F4-guests` (после правок Ф4 `011f32e`). Remote нет |
| Экраны | `/e/new` — мастер; `/e` — «Жаңа той ашу»; `/e/{id}/settings` → `/settings/members` — составители; `/join/{token}` — экран `#switch` |
| Локальный запуск | `pnpm db:local --memory` → `pnpm db:migrate` → `pnpm db:seed --links` → `pnpm dev`; хозяин сида (Әкесі) есть в `allowed_owners` |
| Скриншоты | `docs/phases/F3-screens/` (раздел 6) |

## 2. Что сделано

### 2.1 Сервер — `src/server/events/service.ts`, действия `src/server/actions/events.ts`
- `createEvent` — доступ: сессия `scope = 'all'` **и** номер в `allowed_owners` (`canCreateEvents` → `ok` / `needFullLogin` / `notAllowed`). Одна транзакция создаёт:
  - событие (`title` как ввёл хозяин, `tz = Asia/Almaty`, `template_id`, `default_locale` из языка интерфейса);
  - `door_token` (`randomToken`);
  - хозяина в `event_members`: `role = owner`, `member_kind = parent`, полные права, подпись `roles.owner`, имя из `users.name`, категория по умолчанию «Өз туыстар»;
  - 8 категорий с подписями kk/ru из `category.names.*` на момент создания;
  - `purge_after = starts_on + 90 дней`.
- Проверки: название 1–120; `map_url` только `https://`; время `HH:MM`; тексты ≤ 600.
- `setupHall` — через `withSeating` (право `seating`, лимиты 1–60 столов и 6–16 мест — zod и CHECK). Шаг сам пишет настройки зала и строки `hall_tables` (лишние удаляет, FK `on delete set null`), места — движок `setupHall`. Запись истории `hall` (`record: true`, правило П1 из Ф4). Необязательный `seatingVersion` защищает от записи поверх чужих изменений (`conflict: version`) — для H1 в Ф7b.
- `updateEvent` — только хозяин, `version` → 409. Экран правки — в настройках, позже.
- `addMember` — только хозяин:
  - «Кім?» задаёт подпись, тип, права по умолчанию (5.3) и категорию: Әкесі → Өз туыстар, Анасы → Нағашылар, Жастар → Достар, Басқа → Басқа;
  - хозяин может переключить права;
  - дубль номера → `alreadyMember` (проверка до вставки и уникальный индекс);
  - ссылка выпускается сразу (`issueMemberLink`), ответ — `{ memberId, url, waUrl }`.
- `updateMember`, `removeMember`, `signOutMember`, `newMemberLink`, `rotateDoorToken`:
  - `removeMember` ставит `removed_at`, закрывает неиспользованные ссылки и снимает событие из сессий этого человека по ссылкам. Гости остаются;
  - хозяина удалить нельзя (`ownerCannotRemove`).
- `membersView` — статусы `joined` (устройство и время) / `notJoined` (сколько часов осталось) / `linkExpired`. Устройство берётся **только из сессий, которым доступно это событие**: `scope = 'all'` или событие в `session_events`. Устройства человека из чужих событий не видны (integration).
- Миграция `0004_member_display_name`: `event_members.display_name` ≤ 40 — имя для «Анасы · Гүлжан» (отклонение 2).

### 2.2 Экраны
- **`/e/new` — мастер** (макет 10).
  - 8 шагов, прогресс «N / 8» и полоса. «Жалғастыру» прилипает внизу (на десктопе — в карточке рядом с «Артқа»). Проверки — на каждом шаге.
  - Черновик не сохраняется. В конце — один вызов `createEventAction` (событие + зал, если задан), затем экран «Дайын!» с «Тізім толтыратындарды қосу» → составители и «Тізімге өту».
  - Уход:
    - «←» и системный «Назад» ведут на предыдущий шаг;
    - на первом шаге с введёнными данными — `wizard.leave.*`;
    - при закрытии вкладки — `beforeunload`.
  - Десктоп: рейка шагов (пройденные ✓), карточка шага, справа упрощённый предпросмотр в рамке телефона в цветах шаблона; на шаге зала — «Зал осылай болады».
  - Шаги:
    1. **Тип:** 6 плиток, под кнопкой `legal.ownerTerms`.
    2. **Кімнің тойы?:** подпись поля зависит от типа; подсказка про «ничего не добавляем»; хозяева; дата и время — нативные поля.
    3. **Ресторан:** ошибка `wizard.venue.mapError`.
    4. **Текст:** готовые тексты из `src/domain/invitations/presets.ts`. Места имён подсвечены, окончания хозяин ставит сам. «Өзгерту» открывает поле со счётчиком «N / 600». Русский текст необязателен (`ruMissing`).
    5. **Шаблон:** 3 карточки с мини-конвертом в цветах шаблона.
    6. **Музыка:** только тексты и «Кейін қосамын» (Ф5).
    7. **Зал:** `HallSetupForm` — общий с H1 (Ф7b); «Кейін баптаймын».
    8. **Тексеру:** строки «подпись — значение — Өзгерту», кнопка «Той ашу».
- **Сессия по ссылке на `/e/new`** — экран `wizard.needFullLogin.*` с «SMS-кодпен кіру». Сервер в любом случае отвечает 403.
- **`/e`** — кнопка «Жаңа той ашу» для тех, кто может создавать события. Хозяин без событий после входа сразу попадает в мастер. Остальные видят `events.list.createRestricted`.
- **«Тізімді кім толтырады»** (макет 11). Пункт «Баптаулар» в боковой панели у хозяина; на телефоне — «⋯ → Баптаулар» → строка.
  - Карточки:
    - аватар, «Анасы · Гүлжан», замаскированный номер;
    - чипы прав со значком;
    - статус: «Кірді · Android · Chrome · 12.11, 14:05» / «Әлі кірмеді · … N сағат» / «… мерзімі өтті».
  - Действия:
    - «WhatsApp-қа жіберу»: новая ссылка и `location.assign(waUrl)`;
    - «Жаңа сілтеме»: тост «Ескі сілтеме жабылды», на карточке появляется зелёная ссылка WhatsApp;
    - «Құрылғылардан шығару» и «Тойдан алып тастау» — с подтверждением, фокус на «Бас тарту».
  - Шторка «Адам қосу» (справа 480 px на ≥ 1024):
    - Телефон, «Кім?», «Кім? Мысалы: Әпкесі», «Аты»;
    - права радио-карточками с пояснениями, переключатель «Шығындар», категория по умолчанию;
    - «Қосу және сілтеме жіберу» → `location.assign(waUrl)`;
    - ошибки: `alreadyMember` под телефоном, неполный номер, лимит ссылок.
  - Блок «Кіреберіс сілтемесі» скрыт флагом до Ф8 (раздел 5).
- **`/join/{token}#switch`.** Если на устройстве вошёл **другой** человек, сначала показывается «Бұл телефонда басқа адам кірген» с «Жоқ, қалсын» (фокус) и «Иә, мен кіремін». «Иә» входит по ссылке и закрывает сессию прежнего человека на этом устройстве. Сервер не примет POST без `switch=1`, даже если экран обойти.
- **Пометка «сынақ нұсқасы»** — компонент Ф1 (только хозяину, «✕», память на устройстве, не на «Зал»). Добавлена в мастер. На `/join` и `/login` её нет.

## 3. Изменённые файлы

- Новые:
  - `src/server/events/service.ts`, `src/server/actions/events.ts`;
  - `src/domain/invitations/presets.ts`;
  - `src/ui/hall/HallSetupForm.tsx`, `src/ui/lib/history.ts` (вынесен `afterSheetClosed`);
  - `src/app/e/new/{page,Wizard}.tsx`, `src/app/e/[eventId]/settings/members/{page,MembersScreen}.tsx`;
  - `db/migrations/0004_member_display_name.sql`;
  - тесты `tests/integration/events.test.ts`, `tests/unit/presets.test.ts`, `tests/e2e/events.spec.ts`, `tests/e2e/screens-f3.spec.ts`.
- Изменены:
  - `src/server/schema.ts` (`display_name`);
  - `src/server/actions/auth.ts` (`#switch`);
  - `src/app/(auth)/join/[token]/page.tsx`, `src/app/e/page.tsx`, `src/app/e/[eventId]/settings/page.tsx`;
  - `EventShell.tsx`, `layout.tsx` (namespace `members`);
  - `src/ui/components/AppShell.tsx`: «Баптаулар» в панели у хозяина; `back.mobileOnly`;
  - `src/ui/components.css` (раздел «Ф3 wizard and members» — перенос `flows.css` в rem; классы, совпадавшие с китом, переименованы: `.row2` → `.field-row2`, `.phone` → `.phone-frame`);
  - `src/ui/tokens.css` (цвета трёх шаблонов);
  - `tests/e2e/global-setup.ts` (две сессии хозяина для `#switch`), `tests/e2e/auth.spec.ts` (вход хозяина без событий ведёт в мастер).

## 4. Матрица доступа (новые действия)

| Действие | Хозяин | Әкесі / Анасы (`parent`) | Жастар / Басқа | Сессия по ссылке (`scope = events`) | Чужой |
|---|---|---|---|---|---|
| `createEvent` | ✓, если номер в `allowed_owners` и `scope = all` | так же (только свой номер в `allowed_owners`) | так же | **403** + экран | — |
| `updateEvent`, `addMember`, `updateMember`, `removeMember`, `signOutMember`, `newMemberLink`, `rotateDoorToken`, `membersView` | ✓ | 403 | 403 | ✓ только для события сессии (хозяин по ссылке) | 403 |
| `setupHall` | ✓ | ✓ (`can_edit_seating`) | 403 | по праву в событии сессии | 403 |

Integration: `createEvent` 403 для `scope = events` и без `allowed_owners`; `addMember` / `removeMember` 403 для составителя; `membersView` 403 для составителя.

## 5. Что скрыто флагами

| Что | Флаг | Как включить |
|---|---|---|
| Блок «Кіреберіс сілтемесі» на экране составителей (страница помощника — Ф8) | `NEXT_PUBLIC_FEATURE_DOOR=1` | env на Vercel/локально; действие `rotateDoorTokenAction` уже работает |
| Загрузка музыки в шаге 6 (Ф5: presigned R2 + ffmpeg) | проп `musicUpload` у `Wizard` (по умолчанию `false`) | в Ф5 включить загрузчик и состояния `#music-up` … `#music-ready` |
| Живой предпросмотр приглашения | — | сейчас упрощённая карточка в цветах шаблона; настоящий рендер — Ф5 |
| Ссылки «пайдалану шарттары» / «құпиялылық саясаты» в `legal.ownerTerms` | — | страниц ещё нет — слова выделены, но не ссылки (отклонение 8) |

## 6. Скриншоты — `docs/phases/F3-screens/`

Имена `{экран}_{ширина}_{язык}.png`, рядом с `design/v2/screenshots/10-wizard_*`, `11-members_*`, `09-join-login_switch_*`. Пометка «сынақ нұсқасы» видна, потому что вошёл хозяин.

| Экран | Файлы | Макет |
|---|---|---|
| Мастер, шаги 1–8 | `W1-kind_*`, `W1-kind_320_*`, `W2-who_*`, `W3-venue-error_*`, `W4-text_*`, `W4-text-edit_*`, `W5-template_*`, `W6-music_*`, `W7-hall_*`, `W7-hall_360_*_130`, `W8-review_*` | `10-wizard_{360,1440}`, `_who_*`, `_venue-error_360`, `_text_*`, `_text-edit_360`, `_template_*`, `_music_360`, `_hall_*`, `_hall_360_t130*`, `_review_*` |
| «Дайын!», выход | `W9-done_1440_*`, `W-leave_*` | `10-wizard_done_*`, `_leave_360` |
| Составители | `M-members_*`, `M-members_360_*_130`, `M-add_*`, `M-add-other_*`, `M-add-error_*`, `M-remove_*`, `M-newlink_*` | `11-members_*`, `_add_*`, `_add-other_360`, `_add-error_360`, `_remove_360`, `_newlink_360` |
| `/join#switch` | `J-switch_{360,1440}_*` | `09-join-login_switch_*` |

Экран `#scope` («нужен вход по SMS») проверен e2e, отдельного скриншота нет.

## 7. Критерии приёмки

| # | Критерий | Статус |
|---|---|---|
| 1 | Мастер создаёт событие одним вызовом; до «Той ашу» ничего не создаётся; выход спрашивает | ✅ e2e (с залом, без зала, выход, системный «Назад») |
| 2 | Зал необязателен; если задан — `hall_tables` и запись истории через движок | ✅ integration (`setupHall`) + e2e |
| 3 | `createEvent` недоступен сессии по ссылке | ✅ integration 403 + e2e экран |
| 4 | Права по типу, ссылка через WhatsApp, статусы без чужих устройств, «шығару» и удаление — только это событие | ✅ integration + e2e (мама входит в другом контексте браузера) |
| 5 | `/join#switch` | ✅ e2e: «Жоқ, қалсын» оставляет хозяина, «Иә» входит составителем (у его сессии нет права создавать события) |
| 6 | Пометка «сынақ нұсқасы» | ✅ компонент Ф1 и его e2e (`shell.spec`: закрытие помнится после перезагрузки, не на «Зал»); в мастере видна хозяину |
| 7 | Как в макетах 10, 11, 09#switch; axe; 130 % | ✅ скриншоты; e2e axe и 130 % для мастера и составителей |
| 8 | Все проверки зелёные; тексты только из `content/messages` | ✅ раздел 9 (исключения — данные готовых текстов и раздел 10) |

## 8. Отклонения

1. **Имя ветки** — `phase/F3-event-members`, как в брифе. Координатор назвал `phase/F3-event`.
2. **Новая колонка `event_members.display_name`** (миграция 0004). В плане 5 нет места для «Аты» составителя (`users.name` может не быть, и его нельзя менять из чужого события). Хозяину пишется `users.name`.
3. **Хозяин в `event_members`** получает подпись `roles.owner`, `member_kind = parent` и категорию «Өз туыстар». Мастер не спрашивает роль хозяина: в макете такого шага нет.
4. **Номер составителя — только казахстанский мобильный** (`+77…`). Составитель может входить по SMS-коду (Ф0, Н4). У гостей в Ф4 допустимы российские номера.
5. **Готовые тексты** хранятся как данные события (бриф §2), не в `content/messages`. Пример имени в `[…]` остаётся в тексте после выбора и подсвечивается в карточке. **Открытый вопрос:** если хозяин не заменит пример имени, оно попадёт в приглашение. Можно показывать предупреждение на шаге «Тексеру», если текст совпадает с готовым без правок, — нужно решение архитектора и контент-лида.
6. **Действия экрана составителей** — новые `newMemberLinkAction` и `signOutMemberAction` (с `revalidatePath`) рядом с действиями Ф2 `issueLoginLinkAction` и `revokeMemberSessionsAction`. Действия Ф2 оставлены для совместимости.
7. **Подписи кнопок степперов** «Үстел саны» и «Бір үстелде неше орын?» для экранного диктора собраны как «{заголовок} −/+» — ключей `hall.setup.tables.decrease/increase` нет (раздел 10).
8. **`legal.ownerTerms`** — «пайдалану шарттары» и «құпиялылық саясаты» выделены, но не ссылки: страниц ещё нет.
9. **«Тек тізім» не видит кнопок рассадки** — проверить нечем, пока «Зал» — заглушка (Ф7b). Сервер уже отклоняет `setupHall` без права `seating` (матрица, раздел 4). «Жастар не видят Шығындар» и правило пометки покрыты e2e Ф1 (`shell.spec`).
10. **Дата в статусе «Кірді»** — `ДД.ММ, ЧЧ:ММ` по Алматы. Если устройство неизвестно (сессия без User-Agent), вместо него «—».
11. **Локальный e2e — последовательно** (`--workers=1`), как в Ф4. Производительность Ф4 (`guests-perf.spec.ts`) при полном прогоне на этой машине у границы 1 с; отдельно — в пределах (раздел 9).

## 9. Проверки — реальный вывод
```
$ pnpm check:messages
check:messages: OK — 772 keys, kk/ru: ICU, variables, tags, select/other, ru plural forms
$ pnpm typecheck && pnpm lint && pnpm format:check
✓ Types generated successfully · eslint --max-warnings=0 (0) · All matched files use Prettier code style!
$ pnpm test
      Tests  158 passed (158)              (+5 tests/unit/presets.test.ts)
$ pnpm test:integration                    (PGlite)
 Test Files  8 passed | 1 skipped (9)
      Tests  87 passed | 2 skipped (89)    (+8 tests/integration/events.test.ts; 2 пропуска — concurrency Ф4 только на Postgres)
$ pnpm build
… ƒ /e/new · ƒ /e/[eventId]/settings/members
$ E2E_CHANNEL=chrome DATABASE_URL=…PGlite… pnpm test:e2e --workers=1   (mobile + desktop + small)
S1 interactive (CPU ×4): first uncached 1797 ms; warm runs 883, 903, 966, 1087, 1420 ms
  13 skipped
  119 passed (5.1m)
$ SCREENSHOTS=1 pnpm test:e2e tests/e2e/screens-f3.spec.ts --project=desktop --workers=1
  2 passed (1.4m)                          (76 файлов в docs/phases/F3-screens/)
$ gitleaks protect --staged
INF no leaks found
```
e2e Ф3 (`events.spec.ts`, ×2 проекта):
- мастер с залом и без зала;
- выход из мастера;
- системный «Назад» в мастере;
- axe и 130 % на шагах;
- «Анасы»: ссылка wa.me → вход в другом контексте браузера → событие; её сессия на `/e/new` видит «нужен вход по SMS»;
- `#switch`;
- дубль номера, удаление, axe и 130 % на экране составителей.

Пропуски:
- скриншотные спеки без `SCREENSHOTS=1`;
- B1 на `desktop`;
- производительность вне `mobile`.

## 10. Запросы контент-лиду
- `hall.setup.tables.decrease` / `.increase`, `hall.setup.seats.decrease` / `.increase` — подписи кнопок «−/+» для экранного диктора.
- Из Ф4 (П2): «Жауап өзгеріп кетті» / «Ответ уже изменился» — тост при отказе «Қайтару».
- Строка-предупреждение для шага «Тексеру», если в тексте приглашения остался пример имени (отклонение 5), — после решения.
- `legal` — страницы условий и политики (тексты есть в `content`? — уточнить у основателя).

## 11. Самопроверка (13.6)
- [x] Задачи брифа выполнены; отклонения записаны (раздел 8).
- [ ] Проверка на preview URL — ожидает Vercel.
- [x] Каждое действие: `requireUser` → zod → сервис с `authorize` / `canCreateEvents`; ничего не создаётся до конца мастера.
- [x] Зал — только через `withSeating` и движок.
- [x] Тексты интерфейса — только `content/messages` (772 ключа); готовые тексты приглашений — данные (бриф).
- [x] Доступность: axe без serious/critical, 130 %, фокус на безопасных кнопках, «Назад» в мастере и шторках.
- [x] Серверы, запущенные для проверок, остановлены.

---

## 12. Правки по ревью (`docs/phases/Ф3-review.md`, вердикт «нужны правки»)

Цепочка F0 → F7a → F2 → F1 → F4 → F3 перебазирована на `main` с коммитом контент-лида `51ddd7e` (`content/invitation-presets.json`, 778 ключей). Конфликтов нет.

### П1 — готовые тексты без имён (А6)
- `src/domain/invitations/presets.ts` больше не хранит тексты: он читает `content/invitation-presets.json` (форма `{ version, kk: { <kind>: [{ id, text }] }, ru: … }`, CONTENT_REVIEW §8). Тексты — обычный текст; подсветка образцов (`presetParts` / `presetPlain`) удалена.
- **Проверка** `scripts/check-presets.ts` встроена в `pnpm check:messages`, поэтому идёт и в CI. Она требует оба языка, все шесть типов тоя минимум с одним текстом, уникальные `id`, ни одного `[ ] { } < >` и длину ≤ 600. Unit-тесты: файл контента проходит; ловятся образец, переменная, разметка, пропущенный тип и повтор `id`.
- **Блок.** `hasPlaceholder` — любая квадратная скобка.
  - Мастер:
    - на шаге «Шақыру мәтіні» «Жалғастыру» не проходит: поле kk или ru открывается для правки, под ним ошибка `wizard.text.placeholderLeft`;
    - на шаге «Тексеру» «Той ашу» возвращает на шаг текста с той же ошибкой.
  - Сервер: `createEvent` и `updateEvent` (`validateEvent`) отвечают `{ field: "textKk" | "textRu", error: "placeholderLeft" }` и ничего не сохраняют.
  - Тесты: integration (`createEvent` с `[…]` → ничего не создано; `updateEvent` → текст не изменился) и e2e (готовые тексты без скобок; вписанный образец не даёт пройти дальше, исправленный текст проходит).
- Отклонение 5 снято.

### П2 — ключи контент-лида
- Степперы зала: `hall.setup.tables.decrease/increase`, `hall.setup.seats.decrease/increase` вместо склейки «{заголовок} −/+». Отклонение 7 снято.
- Ф4: отказ «Қайтару» ответа — тост `guestSheet.answer.undoChanged` («Жауап өзгеріп кетті») вместо `errors.conflict`.

### Н1
- Неиспользуемые действия Ф2 `issueLoginLinkAction` и `revokeMemberSessionsAction` удалены: экран составителей использует `newMemberLinkAction` и `signOutMemberAction`.

### Проверки — реальный вывод
```
$ pnpm check:messages
check:messages: OK — 778 keys, kk/ru: ICU, variables, tags, select/other, ru plural forms
check:presets: OK — 16 texts, 6 kinds × kk/ru, no samples, variables or markup
$ pnpm typecheck && pnpm lint && pnpm format:check
✓ Types generated successfully · eslint --max-warnings=0 (0) · All matched files use Prettier code style!
$ pnpm test
      Tests  161 passed (161)
$ pnpm test:integration                    (PGlite)
 Test Files  8 passed | 1 skipped (9)
      Tests  88 passed | 2 skipped (90)
$ E2E_CHANNEL=chrome DATABASE_URL=…PGlite… pnpm test:e2e tests/e2e/events.spec.ts --workers=1
  18 passed (1.6m)                         (+2: блок образца [ ] на 360 и 1440)
$ … pnpm test:e2e --workers=1              (весь набор)
  1 failed · 13 skipped · 120 passed (8.9m)
  failed: guests-perf (S1 interactive warm 2940–5103 ms) — прогон шёл параллельно с vitest на той же машине
$ … pnpm test:e2e tests/e2e/guests-perf.spec.ts --project=mobile   (отдельно, без нагрузки)
S1 interactive (CPU ×4): first uncached 1128 ms; warm runs 613, 644, 713, 724, 853 ms
  1 passed
$ gitleaks protect --staged
INF no leaks found
```
Скриншоты `docs/phases/F3-screens/` пересняты (`SCREENSHOTS=1 … screens-f3.spec.ts`, 2 passed): в шаге 4 (`W4-text_*`) теперь готовые тексты без имён.
