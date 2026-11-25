# Перевірка (Task A, B, C і бонус E)

> Сюди — лише те, що справді сталося у сесії: цитати, числа, імена файлів.

Інструмент: Claude Code 2.1.252 (desktop app, вкладка Code).

## Task A — чи завантажуються правила

### 1. Нова сесія, без відкриття файлів

- Запит: «Не відкривай і не читай жодних файлів і не запускай жодних команд.
  Перелічи правила проєкту, які зараз є у твоєму контексті…»
- Кроки інструментів до відповіді: окремо не фіксувались; що завантажено, підтверджує
  `/context` нижче.
- Відповідь агента (коротко): назвав лише правила з `.claude/rules/do-not-touch.md`
  (захищені теки `app/src/core/**`, `app/scripts/**`, `materials/**`, `.coderabbit.yaml`,
  `.github/**`; без винятків; «зупинись і опиши зміну в core») і `CLAUDE.md`
  (лише посилання на AGENTS.md). `architecture` і `conventions` — «немає в контексті».
- `/context` → Memory files:
  ```
  ~/2026-quitcode-03-rules-commands-hw/CLAUDE.md
  ~/2026-quitcode-03-rules-commands-hw/.claude/rules/do-not-touch.md
  ```
- Очікувано: лише `.claude/rules/do-not-touch.md` (без `paths` — завжди);
  `architecture` і `conventions` ще немає.

### 2. Та сама сесія, після читання файлу з `app/src/`

- Запит: «Прочитай файл `app/src/sync/run.ts`…»
- Кроки інструментів: один Read — `app/src/sync/run.ts`; файли `.claude/rules/*.md`
  агент не відкривав.
- Відповідь агента (цитата):
  > Opening this file also loaded two more project rule files into my context that
  > weren't there when you asked earlier: .claude/rules/architecture.md (…) and
  > .claude/rules/conventions.md (…)
- Висновок: правила з `paths: app/src/**` підтягуються лише після читання файлу
  з `app/src/`, `do-not-touch` — з початку сесії. Режими застосування працюють як задумано.

Поведінкову перевірку `do-not-touch` зроблено в Task D — див. `docs/ab-validation.md`.

## Task B — чи бачить інструмент AGENTS.md

- Інструмент і версія: Claude Code 2.1.252
- Було: у `CLAUDE.md` — посилання `[AGENTS.md](./AGENTS.md)`; у Memory files (Task A,
  перевірка 1) був лише `CLAUDE.md`, `AGENTS.md` не завантажувався.
- Стало: у `CLAUDE.md` — імпорт `@AGENTS.md` окремим рядком.
- Як перевірив:
  1. Нова сесія → `/context`, розділ **Memory files**.
  2. Та сама сесія, без відкриття файлів: «Не відкривай файлів і не запускай команд.
     Назви команди проєкту й захищені теки.»
- Результат:
  - Memory files:
    ```
    ~/2026-quitcode-03-rules-commands-hw/CLAUDE.md
    ~/2026-quitcode-03-rules-commands-hw/AGENTS.md
    ~/2026-quitcode-03-rules-commands-hw/.claude/rules/do-not-touch.md
    ```
  - Кроки інструментів до відповіді: немає.
  - Відповідь агента (коротко): джерела — «CLAUDE.md, AGENTS.md,
    `.claude/rules/do-not-touch.md`», файлів не відкривав. Назвав усі 4 команди
    (`npm install`, `npm test`, `npm run typecheck`, `npm run check:rules` з базовою
    лінією `TOTAL: 8`) і перевірку перед комітом; усі 5 захищених зон (`app/src/core/**`,
    `app/scripts/**`, `materials/**`, `.coderabbit.yaml`, `.github/**`), заборону
    `--write-lock` і процедуру «зупинись і опиши». Імена slash-команд чесно не назвав:
    їх немає в завантаженому контексті (Task C ще не зроблено).
  - Висновок: команди й карта є лише в `AGENTS.md`, отже імпорт `@AGENTS.md` працює.

## Task C — прогони команд

### `/analyze-error`

- Виклик: `/analyze-error materials/error-log.txt`
- Чи підставився `$ARGUMENTS`: так — агент одразу працював із `materials/error-log.txt`,
  нічого не перепитуючи.
- Що агент назвав корінною причиною (файл, рядок, механізм) — дві вади, що підсилюють одна одну:
  1. `app/src/sync/state.ts:13-17` + `app/src/sync/run.ts:18` — `saveState` на початку
     запуску перезаписує файл стану; `writeFileSync` спершу обнуляє файл, на `ENOSPC`
     він лишається порожнім → `loadState` ловить виняток `JSON.parse` і **тихо** повертає
     `INITIAL_STATE` (`1970-01-01`) → усі 500+ лідів знову «нові».
  2. `app/src/sync/run.ts:36` — прогрес зберігається лише в кінці; 500+ лідів × ~0,9 с
     (плюс повтори на 429) > ліміту 4m30s → `SIGKILL` до рядка 36, а рядок 18 уже
     записав `1970` → цикл повторюється кожні 5 хвилин.
- Порушені правила: `JSON.parse` без guard і тихе значення за замовчуванням
  (`conventions.md`, зовнішній JSON); `saveState` кидає виняток замість `Result`.
- Чим відрізнив тригер від причини: тригер — нічний бекап заповнив диск, `ENOSPC` у
  `saveState` (00:05). Окремий розділ «Чому спам тривав після тригера»: о 00:13:48 диск
  звільнили, але стан уже скинуто на 1970, а цикл «з `ld_0001` → `SIGKILL` → стан не
  оновлено» самопідтримується; в коді немає виходу з нього.
- Тест-відтворення (текстом): пошкоджений / порожній файл стану → `runSync` нічого не
  розсилає й повертає помилку (зараз розсилає всіх); збереження прогресу після кожного
  ліда при обриві запуску; `saveState` не пошкоджує старий файл при невдалому записі.
- План виправлення без змін у core: `loadState` → `Result` + `parseJson` з guard;
  атомарний `saveState` (tmp + rename); прибрати `saveState` на старті, зберігати
  прогрес після кожного ліда, обмежити тривалість запуску. Окремо — операційний крок:
  вручну відновити `sync-state.json`.
- Чи зупинився там, де сказано в Stop: так — файлів не змінював (`git status --short` без
  змін), завершив словами «Чекаю вашого рішення, перш ніж починати виправлення».
- Ітерацій: одна — причину знайдено з першого запуску, покращувати команду не довелось.

### `/refactor`

- Виклик: `/refactor app/src/integrations/sheets-append.ts`
- Чи підставився `$ARGUMENTS`: так — агент одразу працював із цим файлом.
- `npm run check:rules` для цього файлу: до 7 (`no-any` ×2, `http-via-core`,
  `env-via-config`, `json-via-parse`, `log-via-logger` ×2) → після 0.
  `TOTAL`: 8 → 1 (лишилось спадкове `src/sync/state.ts:14`, поза задачею).
- `npm test` до / після: 18 passed → 18 passed; `npm run typecheck` — без помилок.
- Діф: лише `app/src/integrations/sheets-append.ts`; тест і `index.ts` не змінені
  (асерти не чіпали, default-експорт збережено). Не комітив — показав підсумок.
- Що змінилось у поведінці (має бути: нічого з того, що фіксують тести): з
  перевіреного тестами — нічого: URL `…?token=…`, тіло `{ values: [[…]] }`, текст
  помилки `sheets error: <status>`, рядок журналу `row added for lead …`. Агент сам
  назвав зміни поза тестами: повтори на 5xx/429 через `postJson`; невалідний JSON /
  без `status` → `{ ok: false }` замість винятку; відсутня змінна → помилка `readEnv`
  замість запиту на `undefined`. Плюс: у журнал більше не потрапляє URL з токеном.
- Помічена прогалина: у тесті немає кейсу «відсутня змінна середовища» (конвенція
  вимагає три кейси); агент не додав його, бо AC вимагали ту саму кількість тестів.
- Після незалежного рев'ю (окремий агент, read-only):
  - знайдено латентний витік: при помилці HTTP `sheets-append` повертав у `Result`
    текст `postJson` з URL `?token=…` без маскування (журнал маскувався, `Result` — ні).
    Виправлено вручну: `redact(response.error)` перед `log.error` і `return`, як у
    `telegram-notify`. Тести 26 → 26, `TOTAL` 1 → 1.
  - у команді `refactor.md` усунуто суперечності: Stop тепер, як і AC, дозволяє імпорти
    цільового файлу поза захищеними зонами; AC більше не вимагають «ту саму кількість
    тестів» (наявні — на місці й зелені, нові можна додавати); список API ядра замінено
    посиланням на `architecture.md`.

### `/generate-integration`

- Виклик: `/generate-integration telegram-notify`
- Чи підставився `$ARGUMENTS`: так — агент одразу взяв назву `telegram-notify`.
- Тип: сповіщення → у тексті лише `name`, `source`, `budgetUsd`.
- Які файли створено (діф — рівно 3 файли):
  - `app/src/integrations/telegram-notify.ts` — Bot API `sendMessage`, лише `readEnv`,
    `postJson`, `parseJson` + guard `isTelegramResponse`, `log`; токен у URL, тому
    текст помилки проходить через `redact()`; `name: "telegram-notify"`,
    `requiredEnv: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]`.
  - `app/src/integrations/telegram-notify.test.ts` — 9 тестів (на момент прогону — 8; дев'ятий додано за рев'ю CodeRabbit): успіх (точні URL і тіло,
    немає email / phone), відсутня кожна з двох змінних, HTTP 400 (без повтору, без
    токена в помилці), `ok: false`, невалідний JSON, `name`/`requiredEnv`, формат.
  - `app/src/integrations/index.ts` — імпорт + `telegramNotify` у масиві (2 рядки через
    named-експорт; агент сам це зазначив).
- `grep -nE "fetch|process\.env|JSON\.parse|console\.|any"` по новому модулю → порожньо.
- `npm test`: 18 → 26 passed (7 файлів) на момент прогону; на фінальному коді гілки — 27 passed (7 файлів), перевірено повторно 23.11.2026. `npm run typecheck` — без помилок.
- `npm run check:rules`: `TOTAL: 1` (не зріс; лише спадкове `src/sync/state.ts`),
  для нових файлів 0, `core-untouched` 0. Core не змінено, залежностей не додано,
  не комітив — показав підсумок.

## Task E (бонус) — хук

Виконано 23.11.2026, після рев'ю.

- Файли: `.claude/settings.json` (`PreToolUse`, matcher `Edit|Write` → `node "$CLAUDE_PROJECT_DIR/.claude/hooks/protect-core.mjs"`), `.claude/hooks/protect-core.mjs` (Node, без залежностей). Скрипт читає JSON зі stdin, бере `tool_input.file_path`. Відносний шлях розв'язується відносно `cwd` сесії; потім ціль і корінь репозиторію переводяться в справжні шляхи (`realpath`) і порівнюються без урахування регістру: перевірка `app/src/core/**` йде відносно кореня репозиторію (за розташуванням скрипта) і відносно checkout, у якому лежить ціль, — найближчої теки з `.git` над нею (у git worktree `.git` — файл), але ніколи не відносно `cwd`. Для `app/src/core/**` скрипт пише причину в stderr і виходить з кодом 2. Якщо JSON не читається, теж код 2 (fail closed). Cursor не налаштовано: робота — у Claude Code.
- Перевірка скрипта напряму (stdin → код виходу), після виправлень за рев'ю CodeRabbit 23.11 і 25.11 (регістр шляху: macOS і Windows не розрізняють `CORE` і `core`): шлях тепер рахується відносно кореня репозиторію (дві теки над `.claude/hooks/`), а не відносно `cwd` сесії, і з обох боків береться справжній шлях (`realpath`), тож симлінк на кшталт macOS `/tmp` → `/private/tmp` не ховає core. До виправлення сесія з `cwd = app/` редагувала `app/src/core/log.ts` без блокування (код 0).

  | `cwd` сесії | `file_path` | Код |
  |---|---|---|
  | корінь | `<repo>/app/src/core/log.ts` | 2 |
  | `app/` | `<repo>/app/src/core/log.ts` | 2 |
  | `app/` | `src/core/log.ts` (відносний) | 2 |
  | `app/src/` | `core/new-file.ts` (новий файл, `Write`) | 2 |
  | корінь | той самий `log.ts` через `/tmp/…` замість `/private/tmp/…` | 2 |
  | `app/` через `/tmp/…` | `src/core/types.ts` | 2 |
  | корінь | `app/src/integrations/../core/log.ts` | 2 |
  | корінь | `app/src/CORE/new.ts` (інший регістр; до виправлення 25.11 — код 0) | 2 |
  | корінь | `App/Src/Core/log.ts` | 2 |
  | корінь | `<REPO у верхньому регістрі>/app/src/core/log.ts` | 2 |
  | корінь | `<REPO>/.claude/worktrees/task/app/src/core/log.ts` (git worktree усередині репо; до виправлення 25.11 — код 0) | 2 |
  | `<worktree>/app/` | `src/core/log.ts` (відносний, сесія в worktree) | 2 |
  | `<worktree>/app/src/` | `core/new.ts` (новий файл у worktree) | 2 |
  | worktree | `<worktree>/app/src/integrations/index.ts` | 0 |
  | тека без `.git` поза репо | `<tmp>/app/src/core/x.ts` | 0 (обмеження, див. нижче) |
  | корінь | `app/src/integrations/index.ts` | 0 |
  | `app/` | `src/integrations/index.ts` | 0 |
  | `app/` | `src/integrations/new.ts` (новий файл) | 0 |
  | корінь | `app/src/coreish.ts` | 0 |
  | корінь | `app/src/core/../integrations/x.ts` | 0 |
  | — | не-JSON на stdin | 2 |
- **Реальна спроба 1 — з правилами** (Claude Code 2.1.325, `claude -p "додай коментар на початок app/src/core/log.ts" --permission-mode acceptEdits`, Opus 5.5). Агент не спробував редагувати: його зупинило правило `do-not-touch`, тож хук не спрацював. Цитата: «Я не змінюватиму `app/src/core/log.ts`. Каталог `app/src/core/**` захищений правилом `.claude/rules/do-not-touch.md`…». Ця спроба показує правило, а не хук.
- **Реальна спроба 2 — лише хук**: у тимчасовій копії репозиторію `CLAUDE.md`, `AGENTS.md` і `.claude/rules` перейменовано на `.off`, як у Task D; `.claude/settings.json` і хук лишились. Той самий запит, ті самі прапорці. Агент прочитав файл і викликав `Edit`. Відповідь хука (результат `Edit`, `is_error: true`):

  > PreToolUse:Edit hook error: [node "$CLAUDE_PROJECT_DIR/.claude/hooks/protect-core.mjs"]: protect-core: app/src/core/log.ts — захищена зона app/src/core/** (платформна команда). Зміни в core — окремим PR через рев'ю платформної команди; опиши потрібну зміну замість редагування. Див. .claude/rules/do-not-touch.md.

  Після цього агент відповів: «Я не зміг додати коментар: хук `protect-core` заблокував редагування… Файл я не змінював і обходити хук не пробував». `shasum app/src/core/log.ts` до і після спроби однаковий: `870c88646ac4c70f004095b08d9898dfba08eb75`.
- Обмеження: копію репозиторію без `.git` (просто скопійовані файли) хук не розпізнає — для неї діє лише правило `do-not-touch`; git worktree і клон з `.git` захищені.
- Обмеження: хук ловить лише `Edit` і `Write`. `Bash` (`sed -i`, `>`) і `NotebookEdit` він не закриває; від цього лишається перевірка `check:rules` (`core-untouched`). По одному прогону на кожну спробу.
