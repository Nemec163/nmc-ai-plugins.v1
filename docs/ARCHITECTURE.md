# MemoryOS.v1 — Полная документация

> Версия документа: 2026-03-19
> Репозиторий: `memory-os.v1` (npm workspace monorepo)

---

## Оглавление

1. [Обзор](#1-обзор)
2. [Философия и концептуальная модель](#2-философия-и-концептуальная-модель)
3. [Архитектура высокого уровня](#3-архитектура-высокого-уровня)
4. [Пакеты монорепо](#4-пакеты-монорепо)
5. [Модель памяти: пять уровней](#5-модель-памяти-пять-уровней)
6. [Конвейер обработки памяти](#6-конвейер-обработки-памяти)
7. [Каноническое хранилище (Canon)](#7-каноническое-хранилище-canon)
8. [Теневой runtime](#8-теневой-runtime)
9. [Gateway — SDK и CLI](#9-gateway--sdk-и-cli)
10. [Агентная модель](#10-агентная-модель)
11. [Навыки (Skills)](#11-навыки-skills)
12. [Система задач (Kanban)](#12-система-задач-kanban)
13. [Адаптеры и коннекторы](#13-адаптеры-и-коннекторы)
14. [Структура рабочего пространства](#14-структура-рабочего-пространства)
15. [Конфигурация](#15-конфигурация)
16. [Тестирование и верификация](#16-тестирование-и-верификация)
17. [CI/CD](#17-cicd)
18. [Граф зависимостей пакетов](#18-граф-зависимостей-пакетов)
19. [Форматы данных и контракты](#19-форматы-данных-и-контракты)
20. [Операционные процедуры](#20-операционные-процедуры)
21. [Дорожная карта и текущий статус](#21-дорожная-карта-и-текущий-статус)

---

## 1. Обзор

**MemoryOS.v1** — автономная, самодостаточная операционная система памяти для AI-агентов. Она обеспечивает долговременное хранение, структурированное извлечение и каноническую верификацию знаний о пользователе, его контексте и состоянии — всё это на основе markdown-файлов и git как source of truth.

### Ключевые характеристики

- **Vendor-neutral**: Markdown + YAML + git. Никакой привязки к конкретному LLM-провайдеру.
- **Single-writer canon**: Единственный агент (`mnemo`) имеет право на каноническую запись.
- **Deterministic verification**: Манифесты, чексуммы, граф рёбер — всё перестраиваемо и верифицируемо.
- **Pluggable adapters**: Ядро системы памяти отделено от коннекторов к конкретным средам исполнения (OpenClaw, Codex, Claude).
- **Git-backed**: Полная история изменений, аудит, откат.

Минимальная product-boundary taxonomy и package classification зафиксированы в
[supported-surfaces.md](./supported-surfaces.md). Этот документ описывает
архитектуру; `supported-surfaces.md` фиксирует, какие package surfaces сейчас
production, bounded, internal или retired.

### Что входит в product boundary

| Слой | Что включает | Surface class |
|---|---|---|
| **Core packages** | `@nmc/memory-contracts`, `@nmc/memory-ingest`, `@nmc/memory-canon`, `@nmc/memory-maintainer`, `@nmc/memory-workspace`, `@nmc/memory-agents`, `@nmc/memory-pipeline`, `@nmc/memory-scripts`, `memory-os-runtime` | `internal` |
| **Gateway** | `memory-os-gateway` | `production` programmatic surface |
| **Operator** | `control-plane` | `production` read-only operator surface |
| **Connectors** | `adapter-openclaw`, `adapter-codex`, `adapter-claude` | `adapter-openclaw`: `production`; `adapter-codex` / `adapter-claude`: `bounded` |
| **Tests** | contract tests, integration tests, golden fixtures, `adapter-conformance` | `internal` test-only |
| **Retired compatibility** | `nmc-memory-plugin`, `memory-os-gateway ops-snapshot` bridge | `retired` |

---

## 2. Философия и концептуальная модель

### Принцип «человеческой памяти»

Система моделирует память по аналогии с человеческой когнитивной архитектурой, но адаптирует её для AI-агентов:

- **Наблюдения → Кандидаты → Факты → Идентичность** — информация проходит через последовательные уровни верификации прежде чем стать каноном.
- **Evidence-first**: Каждый факт в каноне ссылается на конкретные наблюдения (evidence links).
- **Append-only timeline**: Эпизодическая память только дополняется, не переписывается.
- **Freshness contracts**: Чёткое разделение между «каноническим» (проверенным) и «runtime» (текущим, неверифицированным) состоянием.

### Доменная модель

```
Сессии → Транскрипты → Claims (L1)
                          ↓ Extract
                    Intake/Pending
                          ↓ Curate
                    Accepted Claims
                          ↓ Apply
                    Canon Records (L2-L5)
                          ↓ Verify
                    Manifest + Graph
```

---

## 3. Архитектура высокого уровня

```
┌─────────────────────────────────────────────────────────────────┐
│                      ADAPTER LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │adapter-openclaw│ │adapter-codex │  │adapter-claude (bounded) │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────────────────┘  │
│         │                  │                                     │
│  ┌──────┴──────────────────┴─────────────────────────────────┐  │
│  │              adapter-conformance (test suite)              │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                      GATEWAY LAYER                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   memory-os-gateway                        │  │
│  │  bootstrap · read · write · query · verify · status ·     │  │
│  │  recall · health · runtime · handoff · cli                │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                       CORE LAYER                                │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐              │
│  │memory-canon  │ │memory-       │ │memory-os-    │              │
│  │ layout       │ │ contracts    │ │ runtime      │              │
│  │ manifest     │ │ records      │ │ shadow store │              │
│  │ graph        │ │ pipeline-    │ │              │              │
│  │ promoter     │ │  adapter     │ └──────────────┘              │
│  │ lock         │ │ compatibility│                               │
│  │ verify       │ └─────────────┘                               │
│  └─────────────┘                                                │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐              │
│  │memory-       │ │memory-       │ │memory-       │              │
│  │ workspace    │ │ maintainer   │ │ scripts      │              │
│  │ paths        │ │ task         │ │ verify.sh    │              │
│  │ fs-helpers   │ │ parser       │ │ status.sh    │              │
│  │ templates    │ │ settings     │ │ onboard.sh   │              │
│  │ scaffold     │ │              │ │ retention.sh │              │
│  └─────────────┘ └─────────────┘ └──────────────┘              │
├─────────────────────────────────────────────────────────────────┤
│                    STORAGE LAYER                                │
│  Git repo: Markdown + YAML + JSONL + JSON                      │
│  Canon:    core/user/*, core/agents/*, core/system/*           │
│  Intake:   intake/pending/*, intake/processed/*                │
│  Meta:     core/meta/manifest.json, core/meta/graph/edges.jsonl│
│  Runtime:  runtime/shadow/* (non-canonical, disposable)        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Пакеты монорепо

Монорепо организован через npm workspaces. Корневой `package.json`:

```json
{
  "name": "memoryos.v1",
  "workspaces": ["packages/*"]
}
```

### Таблица пакетов

| Пакет | npm-имя | Роль | Surface class | Зависимости |
|---|---|---|---|---|
| `memory-contracts` | `@nmc/memory-contracts` | Общие контракты: типы записей, схемы, коды ошибок, adapter protocol | `internal` core | — |
| `memory-ingest` | `@nmc/memory-ingest` | Engine-agnostic source normalization и provenance contracts | `internal` core | `@nmc/memory-contracts` |
| `memory-canon` | `@nmc/memory-canon` | Канонический слой: layout, manifest, graph, promoter, lock, verify | `internal` core | `@nmc/memory-contracts` |
| `memory-maintainer` | `@nmc/memory-maintainer` | Задачи, policy bundles, task parsing, operational contracts | `internal` core | — |
| `memory-workspace` | `@nmc/memory-workspace` | Утилиты путей, FS, шаблонов и scaffold | `internal` core | — |
| `memory-agents` | `@nmc/memory-agents` | Role roster, manifests, render helpers | `internal` core | — |
| `memory-pipeline` | `@nmc/memory-pipeline` | Engine-agnostic pipeline sequencing | `internal` core | `@nmc/memory-contracts`, `@nmc/memory-scripts` |
| `memory-scripts` | `@nmc/memory-scripts` | Deterministic shell scripts: verify, status, onboard, retention | `internal` core | — |
| `memory-os-runtime` | `memory-os-runtime` | Теневое runtime-хранилище (shadow store) | `internal` core | — |
| `memory-os-gateway` | `memory-os-gateway` | Supported SDK и CLI для read/bootstrap/query/status/verify/runtime/handoff | `production` programmatic | canon, workspace, scripts, runtime, agents |
| `control-plane` | `control-plane` | Supported read-only operator SDK/CLI | `production` operator | gateway, runtime, maintainer |
| `adapter-openclaw` | `adapter-openclaw` | Production OpenClaw install/setup connector и installed-artifact wrapper owner | `production` connector | все core через bundle |
| `adapter-codex` | `adapter-codex` | Bounded Codex-коннектор поверх gateway bootstrap/read/handoff | `bounded` connector | gateway + conformance |
| `adapter-claude` | `adapter-claude` | Bounded Claude-коннектор поверх gateway bootstrap/read/handoff | `bounded` connector | gateway + conformance |
| `adapter-conformance` | `adapter-conformance` | Shared capability-scoped тест-сьют для адаптеров | `internal` test-only | — |

### 4.1 `@nmc/memory-contracts`

Фундаментальный пакет без зависимостей. Определяет:

**Константы:**
- `SCHEMA_VERSION = '1.0'` — текущая версия схемы
- `RECORD_TYPES = ['event', 'fact', 'state', 'identity', 'competence']` — типы записей
- `RECORD_TYPE_PREFIXES` — маппинг типа на префикс ID (`event→'evt'`, `fact→'fct'`, `state→'st'`, `identity→'id'`, `competence→'cmp'`)
- `CONFIDENCE_LEVELS = ['low', 'medium', 'high']`
- `REQUIRED_RECORD_FIELDS = ['record_id', 'type', 'summary', 'evidence', 'confidence', 'status', 'updated_at']`
- `EXIT_CODES`, `VALIDATION_ERROR_CODES`

**Валидаторы:**
- `validateRecordEnvelope(record)` — проверяет полноту и корректность записи
- `validateRecordBlock(block)` — проверяет запись + anchor/heading
- `validatePipelineAdapter(adapter)` — проверяет наличие обязательных методов адаптера
- `validatePipelineInvocation(invocation)` — проверяет структуру вызова фазы пайплайна

Все валидаторы возвращают `{ valid: boolean, issues: Array<{code, message, path}> }`.

**Pipeline-адаптер:**
- `PIPELINE_ADAPTER_PHASES = ['extract', 'curate', 'apply']`
- `getPipelineInvocation(adapter, phase, options)` — получает команду вызова
- `formatPipelineInvocation(invocation)` — сериализует в строку команды

### 4.2 `@nmc/memory-canon`

Каноническое хранилище — сердце системы. Зависит от `@nmc/memory-contracts`.

**Layout (`lib/layout.js`):**
- `resolveMetaDir(memoryRoot)` — ищет `core/meta` или `meta/`
- `resolveManifestPath(memoryRoot)` — путь к `manifest.json`
- `resolveGraphPath(memoryRoot)` — путь к `edges.jsonl`
- `listRecordFiles(memoryRoot)` — все `.md` из `core/user`, `core/agents`
- `listCanonicalFiles(memoryRoot)` — все `.md` из канонических корней
- `walkMarkdownFiles(rootDir)` — рекурсивный поиск markdown

**Graph (`lib/graph.js`):**
- `extractRecordIdsFromContent(markdown)` — извлечение record_id из YAML
- `extractLinksFromContent(markdown)` — извлечение ссылок `{rel, target}`
- `validateGraphEdge(edge)` — проверка `{src, rel, dst}`
- `serializeGraphEdge(edge, batchDate)` — JSON-сериализация для `edges.jsonl`

**Manifest (`lib/manifest.js`):**
- `buildManifestSnapshot(options)` — создаёт объект манифеста (record counts, checksums, edges_count)
- `readSchemaVersionFromWorkspace(memoryRoot)` — извлекает версию из `CANON.md`

**Lock (`lib/lock.js`):**
- `createCanonWriteLock(options)` — создаёт объект блокировки
- `acquireCanonWriteLock(options)` — атомарная запись (флаг `wx` — fail if exists)
- `releaseCanonWriteLock(options)` — удаление блокировки с проверкой holder

**Promoter (`lib/promoter.js` + `lib/core-promoter.js`):**
- `promote(request)` — главная точка входа: acquire lock → promoteCanonBatch → release lock
- `promoteCanonBatch(request)` — ядро promotion:
  1. Парсинг pending batch (frontmatter + claims)
  2. Группировка claims по связанным событиям
  3. Генерация record ID с date-based суффиксами
  4. Создание event-записей + производных (fact, state, identity, competence)
  5. Установка связей между записями (caused/supports/derived_from)
  6. Upsert в projection-файлы
  7. Перемещение pending → processed

**Verify (`lib/verify.js`):**
- `verifyCanonWorkspace(options)`:
  1. Список record-файлов
  2. Извлечение всех record ID
  3. Вычисление чексумм файлов
  4. Извлечение ссылок из изменённых файлов (по mtime)
  5. Валидация целостности рёбер (src/dst существуют)
  6. Append валидных рёбер в `edges.jsonl`
  7. Создание `manifest.json`

### 4.3 `@nmc/memory-workspace`

Утилиты для работы с файловой системой рабочего пространства.

**Paths (`lib/paths.js`):**
- `expandHome(inputPath)` — `~` → абсолютный путь
- `toConfigPath(inputPath)` — абсолютный → `~/relative`
- `toPosixPath(inputPath)` — кроссплатформенные сепараторы

**FS Helpers (`lib/fs-helpers.js`):**
- `ensureDir(dirPath)` — `mkdir -p`
- `writeFileIfNeeded(filePath, content, overwrite)` — атомарная запись с skip-логикой
- `ensureSymlink(linkPath, targetPath, overwrite)` — создание/валидация симлинков

**Templates (`lib/templates.js`):**
- `replaceTemplatePlaceholders(content, installDate)` — подстановка `{{INSTALL_DATE}}`
- `copyTemplateTree(templateRoot, targetRoot, overwrite, installDate)` — массовое копирование с placeholder-подстановкой

**Scaffold (`lib/scaffold.js`):**
- `copyMemoryTemplate(...)` — копирование шаблона memory workspace
- `copySystemTemplate(...)` — копирование шаблона system workspace
- `createSharedSkillsWorkspace(...)` — создание симлинков на skill-директории
- `scaffoldAgentWorkspace(options)` — полный setup агентского пространства (рабочая папка, файлы, симлинки)
- `ensureAgentState(agentId, stateDir)` — создание state-директорий агента

### 4.4 `@nmc/memory-scripts`

Shell-скрипты для детерминистических операций:

| Скрипт | Назначение |
|---|---|
| `verify.sh` | Вызывает `verify-cli.js`, stage + commit meta/ |
| `status.sh` | Читает manifest.json, проверяет backlog pending/processed, алерты >7/>90 дней |
| `onboard.sh` | Создаёт `core/agents/{role}/` (4 файла), обновляет `_index.md` |
| `retention.sh` | Архивация processed >90 дней, timeline >1 год, компактификация edges |

### 4.5 `@nmc/memory-maintainer`

Управление задачами и kanban-доской.

**Константы:**
- `STATUS_ORDER = ['backlog', 'planned', 'in_progress', 'blocked', 'review', 'done']`
- `KANBAN_PRIORITY = ['P0', 'P1', 'P2', 'P3']`
- `BOARD_AUTONOMY = ['full', 'partial', 'ask', 'none']`
- `TASK_CANON_FRONTMATTER_KEYS` — разрешённые поля задачи

**Parser (`lib/parser.js`):**
- `parseKanbanFrontMatter(markdown)` — YAML frontmatter парсинг
- `renderKanbanFrontMatter(meta)` — обратная сериализация с умным квотированием

**Task (`lib/task.js`):**
- `computeTaskPolicy(taskMeta, settings)` — вычисление `effective_autonomy` и `effective_git_flow` (наследование от board)
- `normalizeTaskMutation(existingMeta, partialMeta)` — merge с side-effects (done очищает next_action)
- `validateTaskFile(taskText, options)` — parse + validate + compute policy

### 4.6 `memory-os-runtime`

Неканоническое теневое хранилище — disposable, перестраиваемое.

**Buckets:**
```
episodic, semanticCache, procedural, procedureFeedback,
retrievalTraces, triggers, reflections
```

**Ключевые функции (`lib/store.js`):**
- `captureShadowRuntime(options)` — запись runtime-записи + обновление манифеста
- `getRuntimeDelta(options)` — манифест + summary последних run'ов
- `getRuntimeRecallBundle(options)` — полнотекстовый поиск по всем артефактам
- `listRuntimeRecords(options)` — список `*.json` из `runs/`, отсортированных по новизне

### 4.7 `memory-os-gateway`

In-process SDK и CLI — основной интерфейс взаимодействия со всей системой.

**Модули:**

| Модуль | Назначение |
|---|---|
| `bootstrap.js` | Scaffold workspace или отдельной роли |
| `read.js` | Чтение записей, проекций, canonical current |
| `write.js` | Proposal → feedback → completeJob (3-step handoff) |
| `query.js` | Полнотекстовый поиск по канону + pending intake |
| `verify.js` | Обёртка над `verifyCanonWorkspace` |
| `status.js` | Комплексный статус: manifest + backlog + retention + runtime |
| `health.js` | Health check: memory-root, manifest, scripts exist |
| `runtime.js` | Делегация к `memory-os-runtime` |
| `recall.js` | Агрегированный recall: canonical + query + runtime + role bundle |
| `handoff.js` | Инспекция proposal/job состояния, конфликт-детекция |
| `cli.js` | CLI-диспетчер: 15+ команд |
| `records.js` | Утилиты парсинга markdown (frontmatter, projections, records) |
| `load-deps.js` | Dynamic require с fallback на локальные пути |

**CLI-команды:**
```
read-record, get-projection, get-canonical-current,
get-role-bundle, get-recall-bundle,
bootstrap-role, bootstrap-workspace,
query, get-runtime-delta, get-runtime-recall-bundle,
capture-runtime, status, verify, health,
propose, feedback, complete-job
```

**Write Workflow (3-step proposal):**
1. `propose(claims, batchDate)` → создаёт `proposal.json` → status: `proposed`
2. `feedback(entries)` → merge curator decisions → status: `feedback-recorded` или `ready-for-apply`
3. `completeJob()` → генерирует pending batch + lock scaffold + job receipt → status: `ready-for-handoff`

---

## 5. Модель памяти: пять уровней

| Уровень | Название | Персистентность | Описание |
|---|---|---|---|
| **L0** | Working Memory | Ephemeral (runtime) | Текущий контекст сессии. Не является source of truth. |
| **L1** | Candidates Inbox | `intake/pending/` | Сырые claims из транскриптов. Ожидают курирования. |
| **L2** | Episodic Timeline | `core/user/timeline/` | Append-only история событий. Anti-amnesia layer. |
| **L3** | Semantic Knowledge | `core/user/knowledge/` | Стабильные факты с evidence links. |
| **L4** | Identity | `core/user/identity/` | Устойчивые паттерны, модель личности. |
| **L5** | State | `core/user/state/` | Текущая проекция реальности. Валидна на момент последней консолидации. |

### Поток данных между уровнями

```
Транскрипты сессий
       ↓ (Extract)
L1: intake/pending/YYYY-MM-DD.md  ← claim-YYYYMMDD-NNN
       ↓ (Curate: accept/reject/defer)
Accepted Claims
       ↓ (Apply)
L2: core/user/timeline/YYYY/MM/DD.md  ← evt-YYYY-MM-DD-NNN
L3: core/user/knowledge/*.md           ← fct-YYYY-MM-DD-NNN
L4: core/user/identity/current.md      ← id-YYYY-MM-DD-NNN
L5: core/user/state/current.md         ← st-YYYY-MM-DD-NNN
       + core/agents/*/                 ← cmp-YYYY-MM-DD-NNN
       ↓ (Verify)
Meta: manifest.json + edges.jsonl
```

---

## 6. Конвейер обработки памяти

Четыре фазы, запускаемые через `pipeline.sh YYYY-MM-DD`:

### Phase A — Extract

- **Вход**: Транскрипты сессий (`transcripts/*.jsonl`)
- **Выход**: `intake/pending/YYYY-MM-DD.md`
- **Тип**: LLM-фаза
- **Действие**: Извлечение атомарных claims. Каждый claim содержит:

```yaml
## claim-YYYYMMDD-NNN
- source_session: "session-id"
- source_agent: "agent-name"
- observed_at: "2026-03-05T10:15:30Z"
- confidence: high|medium|low
- tags: [tag1, tag2]
- target_layer: L2|L3|L4|L5
- target_domain: "domain-path"
```

### Phase B — Curate

- **Вход**: `intake/pending/*.md` + текущий canon
- **Выход**: Аннотированный intake с решениями curator
- **Тип**: LLM-фаза
- **Действие**: Каждый claim получает `curator_decision: accept|reject|defer` и `curator_notes`

### Phase C — Apply

- **Вход**: Curated intake + целевые файлы канона
- **Выход**: Обновлённые канонические файлы + git commit
- **Тип**: LLM-фаза (через core-promoter)
- **Действие**:
  1. Парсинг accepted claims
  2. Группировка по связанным событиям
  3. Генерация record ID
  4. Создание записей с envelope-форматом
  5. Upsert в projection-файлы
  6. Перемещение pending → processed

### Phase D — Verify

- **Вход**: Memory root
- **Выход**: `manifest.json`, обновлённый `edges.jsonl`, optional git commit
- **Тип**: Детерминистический скрипт (не LLM)
- **Действие**: Подсчёт записей, хеширование файлов, extract links, валидация рёбер, rebuild manifest

---

## 7. Каноническое хранилище (Canon)

### Формат записи (Record Envelope)

Каждая каноническая запись имеет фиксированный формат:

```markdown
<a id="evt-2026-03-05-001"></a>
### evt-2026-03-05-001
---
record_id: evt-2026-03-05-001
type: event
summary: "Краткое описание события."
evidence:
  - "intake/pending/2026-03-05.md#claim-20260305-001"
confidence: high
status: active
updated_at: "2026-03-05T10:15:30Z"
links:
  - rel: caused
    target: "st-2026-03-05-001"
---
Человеко-читаемое описание.
```

### Обязательные поля

| Поле | Описание |
|---|---|
| `record_id` | Уникальный ID: `{prefix}-{date}-{seq}` |
| `type` | `event`, `fact`, `state`, `identity`, `competence` |
| `summary` | Краткое описание |
| `evidence` | Массив ссылок на источники |
| `confidence` | `high`, `medium`, `low` |
| `status` | `active`, `superseded`, `archived` |
| `updated_at` | RFC3339 UTC timestamp |
| `links` | Массив `{rel, target}` — связи с другими записями |

### Типы связей (Graph Relations)

| Связь | Значение |
|---|---|
| `caused` | Событие вызвало состояние/факт |
| `supports` | Факт подтверждает другой факт |
| `derived_from` | Запись выведена из другой |
| `supersedes` | Замещает предыдущую запись |
| `updated` | Обновляет ранее записанное |
| `evidence_of` | Является свидетельством |
| `influenced_by` | Находится под влиянием |

### Manifest (`manifest.json`)

```json
{
  "schema_version": "1.0",
  "last_updated": "2026-03-05T10:15:30Z",
  "record_counts": {
    "events": 2,
    "facts": 2,
    "states": 1,
    "identities": 0,
    "competences": 1
  },
  "checksums": { "core/user/timeline/2026/03/05.md": "sha256..." },
  "edges_count": 6
}
```

### Graph (`edges.jsonl`)

Каждая строка — JSON-объект:
```json
{"batch":"2026-03-05","src":"evt-2026-03-05-001","rel":"caused","dst":"st-2026-03-05-001","at":"2026-03-05T10:15:30Z"}
```

### Lock-механизм

Single-writer lock предотвращает параллельные записи:

```json
{
  "schema_version": "1.0",
  "writer": "mnemo",
  "mode": "exclusive-write",
  "holder": "core-promoter",
  "acquired_at": "2026-03-05T10:15:30Z"
}
```

- Acquire: атомарная запись с флагом `wx` (fail if exists)
- Release: удаление с проверкой holder

---

## 8. Теневой runtime

**Назначение**: Хранение неканонических runtime-артефактов — disposable, перестраиваемое из канона + captured inputs.

**Расположение**: `runtime/shadow/`

### Buckets

| Bucket | Назначение |
|---|---|
| `episodic` | Эпизодические наблюдения текущей сессии |
| `semanticCache` | Кешированные семантические выводы |
| `procedural` | Процедурные паттерны |
| `procedureFeedback` | Обратная связь по процедурам |
| `retrievalTraces` | Трейсы поисковых запросов |
| `triggers` | Триггеры и активации |
| `reflections` | Рефлексии и мета-наблюдения |

**Каждый run** сохраняется как timestamped JSON-файл в `runs/`. Манифест обновляется при каждом capture.

---

## 9. Gateway — SDK и CLI

### SDK (программный доступ)

```javascript
const gateway = require('memory-os-gateway');

// Чтение
const record = await gateway.readRecord({ memoryRoot, recordId });
const projection = await gateway.getProjection({ memoryRoot, projectionPath });
const current = await gateway.getCanonicalCurrent({ memoryRoot });

// Запрос
const results = await gateway.query({ memoryRoot, text: 'trading strategies' });

// Recall bundle (агрегированный)
const bundle = await gateway.getRecallBundle({ memoryRoot, text, roleId });

// Bootstrap
await gateway.bootstrap({ memoryRoot, workspaceRoot, stateDir });
await gateway.bootstrapRole({ memoryRoot, roleId, stateDir });

// Write orchestration
const proposal = await gateway.propose({ memoryRoot, batchDate, claims });
const fb = await gateway.feedback({ memoryRoot, batchDate, entries });
const job = await gateway.completeJob({ memoryRoot, batchDate });

// Operations
const status = await gateway.getStatus({ memoryRoot });
const health = await gateway.getHealth({ memoryRoot });
const verifyResult = await gateway.verify({ memoryRoot });

// Runtime
await gateway.captureRuntime({ memoryRoot, artifacts, capturedAt });
const delta = await gateway.getRuntimeDelta({ memoryRoot });
const recall = await gateway.getRuntimeRecallBundle({ memoryRoot, text });
```

### CLI

```bash
memory-os-gateway read-record --memory-root /path --record-id evt-2026-03-05-001
memory-os-gateway get-projection --memory-root /path --path core/user/knowledge/work.md
memory-os-gateway query --memory-root /path --text "trading patterns"
memory-os-gateway bootstrap-workspace --memory-root /path --workspace-root /path
memory-os-gateway status --memory-root /path
memory-os-gateway verify --memory-root /path
memory-os-gateway health --memory-root /path
memory-os-gateway propose --memory-root /path --batch-date 2026-03-05 --claims '[...]'
memory-os-gateway feedback --memory-root /path --batch-date 2026-03-05 --entries '[...]'
memory-os-gateway complete-job --memory-root /path --batch-date 2026-03-05
```

---

## 10. Агентная модель

### Ростер предопределённых агентов

| Агент | Роль | Модель по умолчанию | Зона ответственности |
|---|---|---|---|
| **nyx** | Orchestrator | opus 4.6 | Главный пользовательский интерфейс, product lead |
| **medea** | Research | codex 5.4 | Исследования и документация |
| **arx** | Implementation | codex 5.4 | Имплементация, рефакторинг, архитектура |
| **lev** | Heartbeat | codex 5.1 mini | Проактивность, kanban, периодические задачи |
| **mnemo** | Memory Writer | codex 5.4 | Единственный canonical writer |

### Рабочее пространство агента

Каждый агент получает:

```
~/.openclaw/workspace/{agent}/
├── AGENTS.md          # Роле-специфичные инструкции
├── system -> ../system  # Симлинк на shared system
├── skills -> ../system/skills  # Симлинк на shared skills
└── heartbeat.md       # (для lev) Guidance по проактивности
```

### Файлы компетенций в каноне

Для каждого агента в `core/agents/{agent}/`:

| Файл | Назначение |
|---|---|
| `COURSE.md` | Вектор развития, цели обучения |
| `PLAYBOOK.md` | Проверенные паттерны и тактики |
| `PITFALLS.md` | Известные ошибки и антипаттерны |
| `DECISIONS.md` | Принятые решения и их обоснования |

Реестр агентов ведётся в `core/agents/_index.md` — таблица с id, role, status, updated_at.

### Профили доступа

| Профиль | Доступ |
|---|---|
| **Memory Curator (mnemo)** | Полный R/W на весь canon |
| **Orchestrator (nyx)** | Полный R на весь canon |
| **Role Agents (medea, arx, lev)** | Constrained R — только свои компетенции + общий knowledge |

---

## 11. Навыки (Skills)

Навыки — переносимые операции, привязанные к адаптеру и видимые агентам через skills workspace.

### Классификация

| Навык | Тип | LLM? | Описание |
|---|---|---|---|
| `memory-extract` | Pipeline | Да | Извлечение claims из транскриптов в `intake/pending/` |
| `memory-curate` | Pipeline | Да | Оценка claims vs. canon: accept/reject/defer |
| `memory-apply` | Pipeline | Да | Запись accepted claims в canon |
| `memory-verify` | Maintenance | Нет | Rebuild manifest + graph edges |
| `memory-query` | Query | Да | Поиск по канону с natural language |
| `memory-status` | Maintenance | Нет | Здоровье системы: manifest + backlog + retention |
| `memory-onboard-agent` | Setup | Нет | Scaffold нового агента в `core/agents/` |
| `memory-pipeline` | Orchestration | Нет | Запуск extract→curate→apply→verify |
| `memory-retention` | Maintenance | Нет | Архивация старых данных, компактификация |
| `kanban-operator` | Task Management | Да | Управление shared kanban-доской |

### Структура skill-директории

```
skills/{skill-name}/
├── SKILL.md       # Frontmatter (name, description) + инструкции для LLM
└── script.sh      # (если script-based) Shell-скрипт
```

---

## 12. Система задач (Kanban)

File-first kanban система для управления задачами агентов.

### Расположение

```
system/tasks/
├── active/
│   ├── .kanban.json    # Board defaults
│   └── T-001-*.md      # Active tasks
├── backlogs/           # Задачи в backlog
├── inbox/              # Входящие
├── done/               # Завершённые
├── recurring/          # Периодические
└── templates/
    └── task.md         # Шаблон задачи
```

### Board Settings (`.kanban.json`)

```json
{
  "gitFlow": "main",
  "autonomy_default": "full"
}
```

### Task Frontmatter

```yaml
---
id: T-001
title: "Задача"
status: in_progress
priority: P1
confidence: high
autonomy: inherit
git_flow: inherit
assignee: arx
created_at: "2026-03-05T00:00:00Z"
updated_at: "2026-03-05T10:00:00Z"
next_action: "Описание следующего шага"
---
Тело задачи с описанием.
```

### Policy Resolution

Задача наследует `autonomy` и `git_flow` от board через значение `inherit`:

```
effective_autonomy = task.autonomy === 'inherit' ? board.autonomy_default : task.autonomy
effective_git_flow = task.git_flow === 'inherit' ? board.gitFlow : task.git_flow
```

### Статусы

`backlog → planned → in_progress → blocked → review → done`

### Приоритеты

`P0` (критический) → `P1` (высокий) → `P2` (средний) → `P3` (низкий)

---

## 13. Адаптеры и коннекторы

Поддерживаемая classification для connector и operator surfaces зафиксирована в
[supported-surfaces.md](./supported-surfaces.md). Ниже описана роль каждого
adapter package, а не отдельная product/support taxonomy.

### adapter-openclaw (Production Direct-Install Surface)

Полнофункциональный адаптер для среды OpenClaw.

**Регистрация:**
- CLI-команда: `openclaw memoryos setup`
- Runtime bootstrap service при загрузке плагина

**Install surface:**
- `openclaw.plugin.json` — манифест плагина
- `plugin.js` → `register()` — регистрация в OpenClaw runtime
- `lib/setup-cli.js` — standalone CLI setup
- `lib/openclaw-setup.js` — orchestration setup logic
- `lib/install-surface.js` — управление install manifest

**Pipeline adapter:**
- `lib/pipeline-adapter.js` — адаптация extract/curate/apply для OpenClaw CLI

**Runtime orchestration:**
- `lib/runtime-orchestration.js` — recall bundles и orchestration helpers поверх gateway

**Conformance:**
- `lib/conformance-adapter.js` — обёртка для тестирования через conformance suite

**Bundle (при npm pack):**
- `scripts/prepare-bundle.js` копирует все 10+ core-пакетов в adapter root
- Генерирует bin wrappers для `memory-control-plane` и `memory-os-gateway`

### adapter-codex (Bounded Connector)

Адаптер для Codex с role-aware bootstrap, canon-safe read-only execution, и bounded single-run contract.

### adapter-claude (Bounded Connector)

Поддерживаемый bounded Claude-коннектор поверх `memory-os-gateway`:

- role-aware bootstrap для Claude workspace
- intake role bundle без прямого доступа к canon write path
- canon-safe read/query/status surfaces через gateway
- explicit proposal upload, feedback/completion handoff и conformance coverage
- без прямой записи в canon, без владения workspace-wide setup и maintainer jobs

### adapter-conformance (Internal Test Suite)

Shared тестовый harness для всех адаптеров.

**9 capability checks:**

| Capability | Что проверяет |
|---|---|
| `roleBundle` | `getRoleBundle()` возвращает role config |
| `bootstrapRole` | Single role bootstrap в temp dir |
| `bootstrapWorkspace` | Full workspace bootstrap |
| `canonicalRead` | `readRecord()` + `getCanonicalCurrent()` |
| `projectionRead` | `getProjection()` |
| `status` | Структура status output |
| `verify` | Verify с fixture workspace copy |
| `writeOrchestration` | Полный propose → feedback → completeJob цикл |
| `cliStatus` | CLI invocation |

Запускаются только для заявленных capabilities адаптера.

---

## 14. Структура рабочего пространства

### После полного scaffold (OpenClaw)

```
~/.openclaw/
├── workspace/
│   ├── system/                    # Shared infrastructure
│   │   ├── memory/                # Canon root
│   │   │   ├── core/
│   │   │   │   ├── agents/
│   │   │   │   │   ├── _index.md
│   │   │   │   │   ├── nyx/     (COURSE, PLAYBOOK, PITFALLS, DECISIONS)
│   │   │   │   │   ├── medea/
│   │   │   │   │   ├── arx/
│   │   │   │   │   ├── lev/
│   │   │   │   │   └── mnemo/
│   │   │   │   ├── meta/
│   │   │   │   │   ├── manifest.json
│   │   │   │   │   └── graph/edges.jsonl
│   │   │   │   ├── system/
│   │   │   │   │   ├── CANON.md
│   │   │   │   │   └── curator-runbook.md
│   │   │   │   └── user/
│   │   │   │       ├── identity/  (current.md, changelog.md)
│   │   │   │       ├── knowledge/ (work, preferences, skills, health, social, finance)
│   │   │   │       ├── state/     (current.md)
│   │   │   │       └── timeline/  (YYYY/MM/DD.md)
│   │   │   └── intake/
│   │   │       ├── pending/       # L1: raw claims
│   │   │       └── processed/     # Archived after apply
│   │   ├── skills/                # Symlinked skill directories
│   │   ├── tasks/                 # Kanban board
│   │   │   ├── active/.kanban.json
│   │   │   ├── backlogs/
│   │   │   ├── inbox/
│   │   │   ├── done/
│   │   │   └── recurring/
│   │   ├── policy/                # Shared autonomy, git, operations
│   │   ├── scripts/               # kanban.mjs и helpers
│   │   └── docs/                  # System-level docs
│   ├── nyx/                       # Agent workspace (→ system)
│   ├── medea/
│   ├── arx/
│   ├── lev/
│   └── mnemo/
├── agents/                        # OpenClaw agent state
│   ├── nyx/sessions/
│   ├── medea/sessions/
│   ├── arx/sessions/
│   ├── lev/sessions/
│   └── mnemo/sessions/
└── extensions/
    └── memoryos-openclaw/         # Installed plugin
        └── bin/                   # CLI wrappers
```

---

## 15. Конфигурация

### Plugin Config (`openclaw.plugin.json` schema)

| Ключ | Тип | Default | Назначение |
|---|---|---|---|
| `autoSetup` | boolean | `true` | Auto-bootstrap при загрузке плагина |
| `stateDir` | string | — | Override для OpenClaw state directory |
| `workspaceRoot` | string | — | Override для workspace root |
| `systemRoot` | string | — | Override для system root |
| `memoryRoot` | string | — | Override для memory root |
| `configPath` | string | — | Override для `openclaw.json` |
| `overwrite` | boolean | `false` | Перезаписывать managed файлы |
| `writeConfig` | boolean | `true` | Записывать в `openclaw.json` |
| `bindings` | array | — | Routing: `agent=channel[:accountId[:peerId]]` |
| `models.*` | object | — | Per-agent model overrides |

### Пример конфигурации

```json
{
  "plugins": {
    "entries": {
      "memoryos-openclaw": {
        "enabled": true,
        "config": {
          "autoSetup": false,
          "workspaceRoot": "~/custom-workspace",
          "models": {
            "nyx": "opus 4.6",
            "medea": "codex 5.4",
            "arx": "codex 5.4",
            "lev": "codex 5.1 mini",
            "mnemo": "codex 5.4"
          }
        }
      }
    }
  }
}
```

---

## 16. Тестирование и верификация

### Contract Tests (`tests/run-contract-tests.sh`)

24 контрактных проверки:

1. **Fixture Tree** — file listing vs. golden snapshot
2. **Canonical Checksums** — SHA256 всех канонических файлов vs. frozen table
3. **Legacy Curate Batch** — checksum intake файла
4. **Record Envelope Contract** — обязательные поля + anchor/heading match
5. **13 Package Fixture Tests** — `node test/validate-fixtures.js` для каждого пакета
6. **Verify.sh Contracts** — manifest schema, edges JSONL format
7. **Status.sh Output** — секции и record counts
8. **Pipeline Dry Run** — exit code 2, command list
9. **Onboard Contract** — 4 файла + _index.md update + duplicate detection
10. **Dangling Edge Contract** — preserve count + stderr warning
11. **Retention Contract** — summary output, optional git commit

### Integration Tests (`tests/run-integration.sh`)

20+ интеграционных тестов:

1. **Packaging Files** — openclaw.plugin.json, package.json, manifest
2. **Skill Frontmatter** — name и description для всех skills
3. **Template Default Agents** — 5 агентов, компетенции, _index.md, CANON.md
4. **npm pack Smoke** — tarball → extract → setup → verify
5. **OpenClaw Setup** — idempotent scaffold, symlinks, config merge
6. **Kanban Policy** — effective autonomy/git_flow resolution
7. **Runtime Auto-Bootstrap** — register() с autoSetup
8. **Direct Surface Smoke** — adapter-openclaw bypass
9. **Script Detection** — memory root resolution
10. **Verify/Status/Pipeline/Retention/Onboard** — functional checks

### Golden Fixtures (`tests/golden/`)

| Файл | Содержимое |
|---|---|
| `manifest-schema.txt` | 10-строчная спецификация schema manifest.json |
| `canonical-file-checksums.txt` | SHA256 18 канонических файлов |
| `legacy-curate-batch-checksums.txt` | SHA256 intake batch файла |
| `fixture-tree.txt` | 21 path — полный file listing fixture workspace |

### Conformance Suite

Capability-driven тестирование адаптеров. Запускает только проверки для заявленных capabilities.

---

## 17. CI/CD

### GitHub Actions (`.github/workflows/nmc-memory-plugin-ci.yml`)

```yaml
on:
  push:
    branches: [main, codex/**]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: ./tests/run-production-readiness.sh
```

---

## 18. Граф зависимостей пакетов

```
                    ┌───────────────────┐
                    │ @nmc/memory-      │
                    │   contracts       │
                    │ (zero deps)       │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ @nmc/memory-canon  │
                    │ layout, manifest,  │
                    │ graph, promoter,   │
                    │ lock, verify       │
                    └─────────┬─────────┘
                              │
    ┌──────────────┬──────────┼──────────┬──────────────┐
    │              │          │          │              │
┌───▼───┐   ┌─────▼────┐  ┌──▼───┐  ┌──▼────────┐  ┌──▼──────────┐
│memory- │   │memory-   │  │memory│  │memory-os- │  │memory-      │
│workspace│  │scripts   │  │-os-  │  │gateway    │  │maintainer   │
│(paths, │   │(shell    │  │runtime│ │(SDK+CLI)  │  │(kanban,     │
│FS,     │   │scripts)  │  │(shadow│ │           │  │tasks,       │
│scaffold)│  │          │  │store) │ │           │  │policy)      │
└───┬───┘   └────┬─────┘  └──┬───┘  └─────┬────┘  └─────────────┘
    │            │            │            │
    └────────────┴────────────┴────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
    ┌─────────▼────┐  ┌──────▼─────┐  ┌──────▼─────┐
    │adapter-      │  │adapter-    │  │adapter-    │
    │openclaw      │  │codex       │  │claude      │
│(production)  │  │(bounded)   │  │(bounded)   │
    └──────────────┘  └────────────┘  └────────────┘
              │
    ┌─────────▼────────┐
    │adapter-conformance│
    │(test suite)       │
    └──────────────────┘
```

---

## 19. Форматы данных и контракты

### Record ID Format

```
{type_prefix}-{YYYY-MM-DD}-{NNN}

Примеры:
  evt-2026-03-05-001   (event)
  fct-2026-03-05-001   (fact)
  st-2026-03-05-001    (state)
  id-2026-03-05-001    (identity)
  cmp-2026-03-05-001   (competence)
```

### Claim ID Format

```
claim-{YYYYMMDD}-{NNN}

Пример: claim-20260305-001
```

### Validation Result Contract

Все валидаторы возвращают:

```javascript
{
  valid: boolean,
  issues: [
    { code: 'MISSING_FIELD', message: 'record_id is required', path: 'record.record_id' }
  ]
}
```

### Promotion Request Contract

```javascript
{
  type: 'canon-write',
  memory_root: '/path/to/memory',
  writer: 'mnemo',
  operation: 'batch-promote',
  batch_date: '2026-03-05',
  options: { /* ... */ }
}
```

### Proposal Lifecycle States

```
proposed → feedback-recorded → ready-for-apply → ready-for-handoff
```

### Health Status

```javascript
{
  status: 'healthy' | 'degraded',
  checks: {
    memoryRoot: { exists: true },
    canonSystem: { exists: true },
    manifest: { exists: true, parseable: true },
    scripts: { exists: true }
  },
  summary: { /* manifest + backlog info */ }
}
```

---

## 20. Операционные процедуры

### Ежедневная консолидация

```bash
# Запуск полного pipeline
./packages/adapter-openclaw/skills/memory-pipeline/pipeline.sh 2026-03-05

# Или по фазам
pipeline.sh 2026-03-05 --phase extract
pipeline.sh 2026-03-05 --phase curate
pipeline.sh 2026-03-05 --phase apply
pipeline.sh 2026-03-05 --phase verify
```

### Проверка здоровья

```bash
# Быстрая верификация
./packages/adapter-openclaw/skills/memory-verify/verify.sh ~/.openclaw/workspace/system/memory

# Статус-отчёт
./packages/adapter-openclaw/skills/memory-status/status.sh ~/.openclaw/workspace/system/memory
```

### Обслуживание

```bash
# Архивация и компактификация
./packages/adapter-openclaw/skills/memory-retention/retention.sh \
  ~/.openclaw/workspace/system/memory \
  --compact-edges \
  --archive-timeline
```

### Добавление нового агента

```bash
./packages/adapter-openclaw/skills/memory-onboard-agent/onboard.sh analyst
# Создаёт core/agents/analyst/ с COURSE, PLAYBOOK, PITFALLS, DECISIONS
# Обновляет core/agents/_index.md
```

### Алерты

| Условие | Порог | Действие |
|---|---|---|
| Pending intake > N дней | 7 дней | Запустить curate + apply |
| Processed files > N дней | 90 дней | Запустить retention |
| Timeline files > N дней | 365 дней | Запустить retention --archive-timeline |
| Dangling edges detected | Любое | Проверить record integrity, запустить verify |

---

## 21. Дорожная карта и текущий статус

### Завершённые фазы

| Фаза | Содержание |
|---|---|
| **Phase 0** | Golden fixture freeze + package skeletons |
| **Phase 1** | Извлечение core пакетов: contracts, ingest, canon, maintainer, scripts, workspace, agents, pipeline |
| **Phase 2** | Gateway SDK: read, bootstrap, query, status, verify, health, write orchestration |
| **Phase 2.5** | Read-only ops harness |
| **Phase 3** | Adapter-openclaw extraction: registration, setup, pipeline, skills, conformance |
| **Phase 4** | Adapter-codex: role-aware bootstrap + bounded single-run contract |
| **Phase 5** | Runtime shadow store + OpenClaw runtime orchestration |
| **Phase 6** | Control-plane: read-only operator surface + health monitor |
| **Phase 7** | Product boundary simplification + supported-surface alignment |
| **Release hardening** | Migration release prep, bridge retirement, surface freeze |
| **Compatibility shell** | Wrapper convergence, skill discovery, artifact layout, regression cutover, install manifest |

### Текущий slice

> completed: `product boundary simplification and supported-surface alignment`
> next: `TBD after Phase 7` — follow-on implementation slice is not locked yet; use the roadmap `Immediate Next Step` section as the source of truth for the next bounded change.

### Инварианты (всегда соблюдаются)

- `openclaw memoryos setup`, auto-bootstrap и `openclaw.plugin.json` не ломаются
- Workspace layout под `system/` не меняется
- Canon on-disk format не меняется при extraction
- Runtime memory не пишет в canon напрямую
- Единственный путь записи в canon — через promotion path
- `./tests/run-integration.sh` остаётся primary regression gate
