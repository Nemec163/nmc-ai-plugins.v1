# Implementation Guide: nmc-memory-plugin

Пошаговый гайдлайн реализации плагина памяти для OpenClaw.
Основан на [memory-design-v2.md](./memory-design-v2.md).

---

## Фаза 0: Scaffolding плагина

**Цель**: создать скелет плагина и шаблоны workspace.

### Шаг 0.1 — Структура директорий плагина

```
nmc-memory-plugin/
  plugin.json
  skills/
    memory-extract/SKILL.md
    memory-curate/SKILL.md
    memory-apply/SKILL.md
    memory-verify/SKILL.md + verify.sh
    memory-query/SKILL.md
    memory-status/SKILL.md + status.sh
    memory-onboard-agent/SKILL.md + onboard.sh
  templates/
    workspace-memory/
      ...полная структура из секции 12 дизайна
  README.md
```

### Шаг 0.2 — plugin.json (манифест плагина)

- `name`, `version: "0.1.0"`, `description`
- `skills[]` — список из 7 скиллов с `id`, `type` (llm/script), `path`
- `templates[]` — ссылка на `workspace-memory/`
- `setup_command` — путь к setup-скрипту

### Шаг 0.3 — Scaffold templates/workspace-memory/

- Все `.gitkeep` файлы для пустых директорий
- Template-файлы с frontmatter (`knowledge/*.md`, `identity/*.md`, `state/*.md`)
- Пустой `manifest.json`, пустой `edges.jsonl`
- `_index.md` с шаблоном реестра агентов
- Предустановленные папки `nyx/`, `medea/`, `arx/`, `lev/`, `mnemo/` с файлами `COURSE.md`, `PLAYBOOK.md`, `PITFALLS.md`, `DECISIONS.md`

**Deliverable**: пустой, но валидный scaffold. `git init && git add -A && git commit`.

---

## Фаза 1: Системные файлы (CANON.md + curator-runbook.md)

**Зависимость**: Фаза 0.

### Шаг 1.1 — CANON.md

Путь: `templates/workspace-memory/core/system/CANON.md`

```yaml
---
schema_version: "1.0"
life_day_timezone: "Europe/Moscow"
canon_scope: "workspace/memory/core/*"
single_writer: "mnemo"
created_at: "{{INSTALL_DATE}}"
---
```

Ниже frontmatter — инварианты системы:

- 5 принципов (MD+YAML в git, Single Writer, Evidence-first, Append-only timeline, Runtime ≠ Canon)
- Контракт записи (record_id, evidence, confidence, status)
- Перечень типов (event / fact / state / identity / competence)
- Правила timestamps (RFC3339 UTC)

### Шаг 1.2 — curator-runbook.md

Путь: `templates/workspace-memory/core/system/curator-runbook.md`

Это **самый критичный файл**. Содержит:

1. Пошаговую инструкцию Phase A (Extract) — что читать, формат claim, правила claim_id
2. Пошаговую инструкцию Phase B (Curate) — accept/reject/defer, формат аннотаций
3. Пошаговую инструкцию Phase C (Apply) — markdown envelope, upsert-правила, checkpoint
4. Примеры claim-ов и решений (3–5 примеров каждого типа)
5. Конфликт-резолюция: supersedes, duplicate detection, contradicting facts
6. Post-apply чеклист

**Оценка объёма**: ~800–1200 строк. Это operation manual, который делает Mnemo автономным.

**Deliverable**: два готовых системных файла. Commit.

---

## Фаза 2: Скрипты (verify, status, onboard)

**Зависимость**: Фаза 0 (структура), Фаза 1 (CANON.md для schema_version).

### Шаг 2.1 — verify.sh (Phase D)

Путь: `skills/memory-verify/verify.sh`

- Принимает аргумент: путь к `workspace/memory/`
- Действия:
  1. Считать все `record_id` из `core/user/**/*.md` и `core/agents/**/*.md` (grep YAML frontmatter)
  2. Подсчитать record_counts по слоям (events, facts, states, identities, competences)
  3. Вычислить SHA256 checksums каноничных файлов
  4. Собрать новые `links[]` из записей, изменённых с последнего manifest
  5. Записать `meta/manifest.json` (полная перезапись)
  6. Append новых рёбер в `meta/graph/edges.jsonl` (валидация src/dst existence)
  7. `git add meta/ && git commit -m "memory: manifest update YYYY-MM-DD"`
- Exit codes: `0` = ok, `1` = warning (dangling edges), `2` = error

### Шаг 2.2 — status.sh

Путь: `skills/memory-status/status.sh`

- Читает `meta/manifest.json` → last manifest date, record counts
- Считает файлы в `intake/pending/` → pending count, oldest date
- Проверяет backlog >7 дней → alert
- Считает `processed/` файлы >90 дней → retention alert
- Выводит диагностический отчёт в stdout

### Шаг 2.3 — onboard.sh

Путь: `skills/memory-onboard-agent/onboard.sh`

- Принимает аргумент: `role_name`
- Создаёт `core/agents/{role_name}/` с 4 файлами (COURSE.md, PLAYBOOK.md, PITFALLS.md, DECISIONS.md)
- Каждый файл — template с пустым frontmatter и заголовком
- Append записи в `core/agents/_index.md`

**Deliverable**: 3 рабочих скрипта. Unit-тест каждого на тестовом scaffold. Commit.

---

## Фаза 3: LLM-скиллы (SKILL.md)

**Зависимость**: Фаза 1 (curator-runbook определяет контракт), Фаза 2 (verify.sh для Phase D).

Каждый SKILL.md определяет: trigger, system prompt, input/output, tools, constraints.

### Шаг 3.1 — memory-extract (Phase A)

- **Trigger**: schedule (daily 00:00) / manual
- **System prompt**: ссылка на curator-runbook.md, секция Phase A
- **Input**: `~/.openclaw/agents/*/sessions/*.jsonl` за указанную дату
- **Output**: `intake/pending/YYYY-MM-DD.md`
- **Tools**: `file_read`, `file_write`, `glob`
- **Constraint**: НЕ загружать канон — только транскрипты

### Шаг 3.2 — memory-curate (Phase B)

- **Trigger**: after extract / manual
- **Input**: `intake/pending/*.md` + релевантные файлы канона (state, knowledge, agents)
- **Output**: аннотированный intake (accept/reject/defer + draft)
- **Tools**: `file_read`, `file_write`, `glob`
- **Constraint**: НЕ загружать транскрипты

### Шаг 3.3 — memory-apply (Phase C)

- **Trigger**: after curate / manual
- **Input**: curated intake + целевые файлы канона
- **Output**: обновлённые файлы канона + git commit
- **Tools**: `file_read`, `file_write`, `glob`, `git`
- **Логика**: checkpoint (`_checkpoint.yaml`), partial success, move `pending/` → `processed/`
- **Git commit message**: `memory: consolidation YYYY-MM-DD (N events, M facts, K agent updates)`

### Шаг 3.4 — memory-query

- **Trigger**: on-demand (пользователь спрашивает)
- **Input**: вопрос на естественном языке
- **Output**: релевантные записи канона с record_id
- **Tools**: `file_read`, `memory_search`, `glob`
- **Логика**: различать canonical current vs runtime delta

**Deliverable**: 4 SKILL.md файла. Commit.

---

## Фаза 4: Интеграционный тест (сквозной pipeline)

**Зависимость**: все предыдущие фазы.

### Шаг 4.1 — Подготовить тестовые данные

- 2–3 фейковых session transcript в формате `.jsonl`
- Разместить в тестовой директории

### Шаг 4.2 — Прогнать pipeline вручную

1. Установить плагин → scaffold создан
2. Запустить `memory-extract` → проверить `intake/pending/YYYY-MM-DD.md`
3. Запустить `memory-curate` → проверить аннотации (accept/reject/defer)
4. Запустить `memory-apply` → проверить записи в `timeline/`, `knowledge/`, `agents/`
5. Запустить `memory-verify` (verify.sh) → проверить `manifest.json` + `edges.jsonl`
6. Запустить `memory-status` → проверить отчёт
7. Запустить `memory-query` с вопросом → проверить ответ с record_id

### Шаг 4.3 — Проверить failure modes

- Crash mid-apply → restart → checkpoint resume
- Невалидный claim → skip, batch продолжается
- Dangling edge → warning, не fatal

**Deliverable**: документированный test run с результатами. Commit.

---

## Фаза 5: Операционная автоматизация

**Зависимость**: Фаза 4 (pipeline работает).

### Шаг 5.1 — Расписание

- `memory-extract` → daily 00:00
- Chain: extract → curate → apply → verify (последовательно)
- При ошибке — stop, retry следующий цикл

### Шаг 5.2 — Retention-автоматизация

- Cron / scheduled task: `processed/` >90 дней → `archive/`
- Alert: `pending/` >7 дней → уведомление
- Quarterly: `edges.jsonl` compaction
- Yearly: timeline archival (>1 года → `archive/`)

### Шаг 5.3 — Runtime-индексация

Подключить пути канона к `memory_search` через `agents.defaults.memorySearch.extraPaths`:

- `workspace/memory/core/user/timeline/**/*.md`
- `workspace/memory/core/user/knowledge/*.md`
- `workspace/memory/core/user/identity/*.md`
- `workspace/memory/core/user/state/*.md`
- `workspace/memory/core/agents/**/*.md`

НЕ индексировать: `intake/*`, `meta/*`, `system/*`.

**Deliverable**: автоматизированный цикл, retention, индексация. Commit.

---

## Порядок приоритетов и зависимости

```
Фаза 0 (scaffold)
  ↓
Фаза 1 (CANON.md + curator-runbook.md)  ← КРИТИЧЕСКИЙ ПУТЬ
  ↓
Фаза 2 (скрипты) + Фаза 3 (SKILL.md)   ← параллельно
  ↓
Фаза 4 (интеграционный тест)
  ↓
Фаза 5 (автоматизация)
```

**Критический путь**: `curator-runbook.md` — самый сложный и важный артефакт. Без него LLM-скиллы не знают, что делать. Рекомендуется выделить на него ~40% общего времени реализации.

**MVP** (минимально работающая версия): Фазы 0–3 + ручной прогон pipeline. Автоматизация (Фаза 5) — следующая итерация.
