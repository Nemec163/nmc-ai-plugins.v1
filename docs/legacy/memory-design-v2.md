> **Status: Design Reference**
> This document captures the v2 conceptual design and data model.
> For current setup and operations, see [implementation-guide.md](./implementation-guide.md) and [../README.md](../README.md).

# Memory Design v2

## 1) Цель и принципы

Построить **личный canon / second brain** — базу знаний, дневник жизни и систему компетенций AI-агентов,
работающую в связке с OpenClaw.

Система должна:
- хранить долговременную память пользователя (события, факты, состояние, идентичность);
- накапливать компетенции ролевых агентов (знания домена, паттерны, анти-ошибки);
- переживать миграции между системами (`git clone` → curator читает runbook → работает);
- быть читаемой и человеком, и AI без специальных инструментов.

### Пять принципов

1. **MD + YAML в git = source of truth.** Канон хранится в markdown-файлах с YAML-метаданными. Runtime-индексы (SQLite, vector, QMD) — производные ускорители, не источник истины.
2. **Single Writer.** Только Memory Curator пишет в каноническую память. Остальные агенты — читатели.
3. **Evidence-first.** Каждый факт, состояние и identity-запись требует ссылки на evidence (событие или claim).
4. **Append-only timeline.** L2 (timeline) только дополняется. Исправления — через correction-события, не перезапись.
5. **Runtime ≠ Canon.** Дневные наблюдения живут в runtime (L0/intake) до ночной консолидации. Канон обновляется циклами.

---

## 2) Концептуальная модель L0–L5

| Слой | Назначение | Writer | Хранение | Ключевой инвариант |
|------|-----------|--------|----------|--------------------|
| **L0** Working Memory | Оперативный контекст текущей сессии | Любой агент | Runtime (не канон) | Эфемерный; не является source of truth |
| **L1** Candidates Inbox | Буфер сырых наблюдений (claims) | Extractor | `intake/pending/` | Живёт до консолидации, потом → `processed/` |
| **L2** Episodic Timeline | «Что произошло» — события по дням | Curator | `core/user/timeline/` | **Append-only**; коррекции только через новые события |
| **L3** Semantic Knowledge | «Что я знаю» — стабильные факты | Curator | `core/user/knowledge/` | Upsert по `record_id`; evidence обязателен |
| **L4** Identity | «Кто я» — текущая личность и эволюция | Curator | `core/user/identity/` | Обновляется редко, при высоком evidence threshold |
| **L5** State | «Что сейчас» — текущая проекция реальности | Curator | `core/user/state/` | Только проекция L2; `as_of` обязателен |

### Потоки данных

```
Session Transcripts
      ↓
   Extract (Phase A)
      ↓
  intake/pending/ (L1)
      ↓
   Curate (Phase B)
      ↓
   Apply (Phase C)
      ↓
  ┌────────────────────────────┐
  │ timeline/ (L2) — события   │
  │ knowledge/ (L3) — факты    │
  │ identity/ (L4) — личность  │
  │ state/ (L5) — состояние    │
  │ agents/<role>/ — компетенции│
  └────────────────────────────┘
      ↓
   Verify (Phase D, скрипт)
      ↓
  manifest.json + edges.jsonl
```

### Freshness Contract

- `state/current.md` означает «текущее на момент последнего manifest», а не speculative real-time truth.
- Дневная дельта до следующей консолидации живёт в L0 / session history / intake.
- Для ответов на вопросы «сейчас/сегодня» агент ДОЛЖЕН различать `canonical current` (подтверждённое) и `runtime delta` (ещё не каноничное).

---

## 3) Структура директорий

```
workspace/memory/
  intake/
    pending/                          # необработанные извлечения
      2026-03-05.md                   # один файл на день extraction
      _checkpoint.yaml                # checkpoint для resume после crash
    processed/                        # завершённые извлечения
      2026-03-05.md
      archive/                        # старше 90 дней
        2026/
          01/

  core/
    system/
      CANON.md                        # инварианты памяти + schema_version
      curator-runbook.md              # ПОЛНЫЙ операционный скрипт curator-а

    user/
      timeline/                       # L2: append-only дневные события
        2026/
          03/
            05.md
            06.md
        archive/                      # старше 1 года
          2025/
            01/
        2026-Q1-summary.md            # квартальный дайджест (опционально)
      knowledge/                      # L3: доменные файлы фактов
        preferences.md
        skills.md
        work.md
        health.md
        social.md
        finance.md
      identity/                       # L4: кто я
        current.md
        changelog.md
      state/                          # L5: текущая проекция
        current.md

    agents/
      _index.md                       # реестр всех ролей
      nyx/                            # оркестратор и основной user-facing агент
        COURSE.md
        PLAYBOOK.md
        PITFALLS.md
        DECISIONS.md
      medea/                          # research и documentation агент
        COURSE.md
        PLAYBOOK.md
        PITFALLS.md
        DECISIONS.md
      arx/                            # coding, refactor, architecture агент
        COURSE.md
        PLAYBOOK.md
        PITFALLS.md
        DECISIONS.md
      lev/                            # heartbeat и kanban execution агент
        COURSE.md
        PLAYBOOK.md
        PITFALLS.md
        DECISIONS.md
      mnemo/                          # single writer канонической памяти
        COURSE.md
        PLAYBOOK.md
        PITFALLS.md
        DECISIONS.md
      trader/                         # пример ролевого агента
        COURSE.md                     # накопленные знания домена
        PLAYBOOK.md                   # паттерны работы
        PITFALLS.md                   # чего избегать
        DECISIONS.md                  # ключевые решения
      designer/                       # ещё один ролевой агент
        COURSE.md
        PLAYBOOK.md
        PITFALLS.md
        DECISIONS.md

    meta/
      manifest.json                   # последний manifest (git хранит историю)
      graph/
        edges.jsonl                   # инкрементальный append рёбер графа
```

### Назначение агентских файлов

| Файл | Назначение | Что содержит |
|------|-----------|-------------|
| `COURSE.md` | Накопленные знания домена | «Что я знаю о своей профессии» — факты, модели, frameworks |
| `PLAYBOOK.md` | Паттерны работы | «Как я действую» — стратегии, best practices, workflows |
| `PITFALLS.md` | Анти-ошибки | «Чего избегать» — ошибки из прошлого, gotchas, red flags |
| `DECISIONS.md` | Лог решений | «Почему я так решил» — ключевые решения с контекстом и evidence |

Агент при старте сессии загружает свою папку как «курс по профессии» — его накопленный опыт.
Новый ролевой агент = новая папка в `agents/` с 4 пустыми файлами + запись в `_index.md`.

### Mnemo как самодостаточный агент

`core/system/curator-runbook.md` — полный операционный скрипт куратора.
При миграции на новую систему (`git clone`) curator читает этот файл и знает ВСЁ:
- какие фазы pipeline выполнять и в каком порядке;
- какие файлы читать и куда писать;
- как обрабатывать конфликты и ошибки;
- формат записей и envelope-контракт.

`agents/mnemo/` — собственная компетенция писателя канонической памяти, накопленная в процессе обслуживания памяти.

---

## 4) Контракт записи

### Обязательные поля (все типы записей)

```yaml
record_id: "evt-2026-03-05-001"       # стабильный id, префикс = тип
type: event                            # event | fact | state | identity | competence
summary: "Пользователь решил сменить работу"
evidence:
  - "intake/pending/2026-03-05.md#claim-003"
  - "core/user/timeline/2026/03/04.md#evt-2026-03-04-012"
confidence: high                       # low | medium | high
status: active                         # active | corrected | retracted
updated_at: "2026-03-05T10:15:30Z"
```

### Дополнительные поля по типу

| Поле | event | fact | state | identity | competence |
|------|-------|------|-------|----------|------------|
| `as_of` | — | — | ОБЯЗАТЕЛЬНО | ОБЯЗАТЕЛЬНО | — |
| `supersedes` | — | опционально | опционально | опционально | опционально |
| `domain` | опционально | ОБЯЗАТЕЛЬНО | опционально | — | ОБЯЗАТЕЛЬНО |
| `links` | опционально | опционально | рекомендуется | рекомендуется | опционально |
| `tags` | опционально | опционально | опционально | опционально | опционально |
| `role` | — | — | — | — | ОБЯЗАТЕЛЬНО |

### Правила

- **record_id** использует человеко-читаемые префиксы:
  - `evt-` (event), `fct-` (fact), `st-` (state), `id-` (identity), `cmp-` (competence)
  - Формат: `{prefix}-{YYYY-MM-DD}-{NNN}` (например `evt-2026-03-05-001`)
- **confidence** — дискретные уровни, назначаются curator-ом:
  - `low`: одиночное/слабое наблюдение
  - `medium`: надёжный вывод из одного сильного или нескольких согласованных сигналов
  - `high`: подтверждение из нескольких независимых evidence
- **evidence** — массив путей к файлам канона или intake с `#anchor` на конкретную запись
- **as_of** — RFC3339 UTC; для state/identity означает «когда это стало истиной»
- **supersedes** — record_id предыдущей записи, которую заменяет данная
- **links** — типизированные связи для knowledge graph:
  ```yaml
  links:
    - rel: derived_from    # state/identity выведен из события
      target: "evt-2026-03-05-001"
    - rel: supersedes      # заменяет предыдущую запись
      target: "st-2026-02-10-004"
  ```
- **status**:
  - `event` → `active | corrected | retracted`
  - `fact | state | identity | competence` → `active | deprecated | retracted`

### Markdown envelope

Каждая запись в каноничном файле — блок с YAML-метаданными:

    <a id="evt-2026-03-05-001"></a>
    ### evt-2026-03-05-001
    ---
    record_id: evt-2026-03-05-001
    type: event
    summary: "Пользователь решил сменить работу"
    evidence: ["intake/pending/2026-03-05.md#claim-003"]
    confidence: high
    status: active
    updated_at: "2026-03-05T10:15:30Z"
    ---
    Подробности: пользователь обсуждал с оркестратором планы по смене работы,
    принял решение после анализа рынка.

Anchor (`<a id="..."></a>`) обязателен для каждой записи — используется в evidence-ссылках.

### Timestamps

- Все machine timestamps — RFC3339 UTC с суффиксом `Z`.
- `timeline/` partitioning — по пользовательской timezone (настраивается в `CANON.md`).
- `intake/` partitioning — по UTC-дате `observed_at`.

---

## 5) Pipeline консолидации

### Ключевой принцип

Каждая LLM-сессия имеет **узкий фокус**, чтобы модель не теряла качество при заполнении контекстного окна.

Разделение фаз мотивировано не организационно, а **когнитивно**:
чем уже задача в одной сессии, тем выше точность и ниже вероятность «потери» деталей.

### Phase A: Extract (1 LLM-сессия)

**Цель**: извлечь атомарные claims из session transcripts.

| | |
|---|---|
| **Input** | Session transcripts за день (`~/.openclaw/agents/*/sessions/*.jsonl`) |
| **Output** | `intake/pending/YYYY-MM-DD.md` |
| **Контекст** | ТОЛЬКО транскрипты. Канон НЕ загружается. |

**Почему отдельно**: extraction требует внимательного чтения длинных транскриптов.
Если в этот же контекст грузить канон для curation, модель начнёт терять детали из транскриптов.

**Формат claim в intake-файле**:

    ## claim-20260305-001
    ---
    source_session: "~/.openclaw/agents/trader/sessions/2026-03-05-abc.jsonl"
    source_agent: trader
    observed_at: "2026-03-05T14:30:00Z"
    confidence: medium
    tags: [trading, strategy]
    target_layer: L3
    target_domain: work
    ---
    Трейдер обнаружил, что стратегия momentum на малых таймфреймах
    систематически убыточна при высокой волатильности.

**Правила extraction**:
- Каждый claim — одно атомарное наблюдение (не "всё из сессии в одном абзаце").
- claim_id: `claim-{YYYYMMDD}-{NNN}` (детерминированный в пределах одного extract-run).
- `target_layer` — подсказка curator-у (L2/L3/L4/L5/agent), не обязательство.
- Source sessions уже обработанные — трекаются по timestamp последнего extract-run.

### Phase B: Curate (1 LLM-сессия)

**Цель**: оценить claims, принять решения, подготовить draft записей.

| | |
|---|---|
| **Input** | `intake/pending/*.md` + релевантные файлы канона |
| **Output** | Аннотированный intake: каждый claim помечен `accept/reject/defer` + draft записи |
| **Контекст** | Claims + текущий канон (state, knowledge, agents). Транскрипты НЕ загружаются. |

**Почему отдельно**: оценка claims требует сравнения с каноном (конфликты, дубликаты, supersedes).
Если сюда добавить транскрипты, контекстное окно переполнится.

**Решения curator-а для каждого claim**:
- `accept` → draft записи с type, target file, record_id
- `reject` → причина отклонения (noise, duplicate, insufficient evidence)
- `defer` → причина отложки (needs more evidence, conflict requires review)

**Output формат** (аннотация в том же intake-файле):

```yaml
# curator annotation:
decision: accept
target_type: competence
target_file: agents/trader/PITFALLS.md
draft_record_id: cmp-2026-03-05-001
draft_summary: "Momentum на малых TF убыточен при высокой волатильности"
```

### Phase C: Apply (1 LLM-сессия)

**Цель**: записать curated claims в канон с точным форматированием.

| | |
|---|---|
| **Input** | Curated claims (из Phase B) + целевые файлы канона |
| **Output** | Обновлённые файлы канона + `git add && git commit` |
| **Контекст** | Только curated решения + файлы для записи. Ни транскрипты, ни полный канон. |

**Почему отдельно**: запись в канон требует точности форматирования markdown envelope.
Модель должна фокусироваться на сериализации, не на оценке.

**Действия**:
- Append событий в `timeline/YYYY/MM/DD.md` (L2)
- Upsert фактов в `knowledge/*.md` (L3) — по `record_id` или supersedes
- Update `identity/current.md` + `identity/changelog.md` (L4) — при достаточном evidence
- Update `state/current.md` (L5) — только как проекция L2
- Update `agents/<role>/{COURSE,PLAYBOOK,PITFALLS,DECISIONS}.md` — agent competence
- Перемещение обработанного intake: `pending/*.md` → `processed/`

**Partial success**: каждый claim обрабатывается независимо.
Если claim N не проходит валидацию — он скипается с аннотацией `[SKIPPED: reason]`,
batch продолжается. В конце: summary `X applied, Y skipped, Z deferred`.

**Git commit**: после успешной записи — `git add && git commit` с message:
`memory: consolidation YYYY-MM-DD (N events, M facts, K agent updates)`.

### Phase D: Verify (скрипт, НЕ LLM)

**Цель**: верифицировать целостность канона и обновить служебные файлы.

| | |
|---|---|
| **Input** | Файлы канона после commit из Phase C |
| **Output** | `meta/manifest.json` + `meta/graph/edges.jsonl` append |

**Действия** (детерминированный скрипт):
1. Подсчитать record_counts по слоям (timeline events, knowledge facts, и т.д.)
2. Вычислить checksums каноничных файлов (user/*, agents/*, system/*)
3. Записать `meta/manifest.json` (перезапись, git хранит историю)
4. Собрать новые `links[]` из добавленных/изменённых записей
5. Append новых рёбер в `meta/graph/edges.jsonl`
6. Проверить: все src/dst в новых edges существуют как record_id в каноне
7. Если всё ок: `git add && git commit` manifest + edges
8. Если ошибка: лог warning, канон из Phase C остаётся валидным (just unmanifested)

### Итого

| Фаза | Тип | Контекст | Пишет в канон? |
|------|-----|----------|----------------|
| A: Extract | LLM | транскрипты → claims | Нет (только intake) |
| B: Curate | LLM | claims + канон → решения | Нет (аннотации в intake) |
| C: Apply | LLM | curated claims → запись | Да + git commit |
| D: Verify | Скрипт | канон → manifest/edges | Да (meta/) + git commit |

**Расписание**: рекомендуется 1 раз в сутки (например 00:00).
Фазы выполняются последовательно: A → B → C → D.
При ошибке на любой фазе — остановка, retry на следующий цикл.

---

## 6) Операционная устойчивость

### Partial success

- Каждый claim в Phase C обрабатывается независимо.
- Плохой claim скипается, batch продолжается.
- Результат: `X applied, Y skipped, Z deferred`.
- Skipped claims остаются в `pending/` для следующего цикла.

### Checkpoint / Resume

Curator записывает `intake/_checkpoint.yaml` в начале Phase C:
```yaml
batch_date: "2026-03-05"
phase: apply
started_at: "2026-03-06T00:15:00Z"
last_processed_claim: "claim-20260305-012"
claims_applied: 12
claims_skipped: 1
```

При crash: следующий запуск читает checkpoint, пропускает уже применённые claims, продолжает с `last_processed_claim + 1`. Checkpoint удаляется после успешного commit.

### Failure modes

| Failure | Что теряется | Recovery |
|---------|-------------|---------|
| Phase A crash | Intake не записан | Retry; транскрипты immutable |
| Phase B crash | Решения не готовы | Retry; pending intake на месте |
| Phase C crash mid-batch | Частичный канон, checkpoint есть | Resume из checkpoint; partial success |
| Phase C commit fail | Ничего не сохранено | Retry Phase C |
| Phase D script fail | Manifest не обновлён | Retry Phase D; канон валиден |
| Git push fail | Не синхронизировано | Retry push; локальный canon ok |

### Degraded modes

| Ситуация | Поведение |
|----------|----------|
| LLM недоступен | Пропуск цикла. Канон на последнем manifest. Алерт. |
| Частичные транскрипты (часть сессий нечитаема) | Extract что есть. Пропущенные сессии — следующий цикл. |
| Модель медленная (>15 мин на фазу) | Лог warning. Не прерывать — дать завершить. |
| Accumulation (>7 дней pending) | Алерт оператору. Возможно: manual trigger, model upgrade, batch split. |

### Retention

- `intake/processed/` — хранить 90 дней, затем → `processed/archive/YYYY/MM/`
- `intake/pending/` — не должен накапливаться >7 дней (алерт)
- Канон (`core/*`) — бессрочно (git history = полная история)
- `meta/graph/edges.jsonl` — квартальная компактификация (скрипт пересобирает из links[])

---

## 7) Knowledge Graph

### Source of truth

`links[]` внутри записей — единственный source of truth для связей.
`meta/graph/edges.jsonl` — производный кэш для быстрого graph-export.

### Типы связей (v1)

| Relation | Значение | Типичное использование |
|----------|---------|----------------------|
| `derived_from` | Запись выведена из source | state/identity ← event |
| `supersedes` | Заменяет предыдущую запись | новый fact ← старый fact |
| `supports` | Evidence-связь | fact ← event(s) |
| `caused` | Причинно-следственная | event ← event |
| `updated` | Ревизия факта | fact revision ← event |

### Формат edges.jsonl

Инкрементальный append — каждый consolidation cycle добавляет только новые рёбра:

```json
{"batch":"2026-03-05","src":"evt-2026-03-05-001","rel":"caused","dst":"st-2026-03-05-001","at":"2026-03-05"}
{"batch":"2026-03-05","src":"st-2026-03-05-001","rel":"derived_from","dst":"evt-2026-03-05-001","at":"2026-03-05"}
```

### Компактификация

Квартально: скрипт сканирует все `links[]` из всех каноничных записей,
пересобирает `edges.jsonl` как полный snapshot, заменяя накопленные дельты.

### Обработка ошибок

Dangling edges (src/dst не найден в каноне) → **warning** в логе, не fatal error.
Рёбра с dangling references не добавляются в `edges.jsonl`.

---

## 8) Масштабирование L2 (Timeline)

### Текущая модель

Один файл на день: `timeline/YYYY/MM/DD.md`.
При 20 событиях в день: ~365 файлов/год, каждый 2–5 KB.

### Стратегия на масштаб

| Временной горизонт | Что делаем |
|-------------------|-----------|
| Текущие 90 дней | Основная зона recall; индексируется по умолчанию |
| 90 дней – 1 год | Доступны в `timeline/`, но recall по explicit запросу |
| > 1 года | Перемещаются в `timeline/archive/YYYY/MM/DD.md` |
| Квартально | `timeline/YYYY/QN-summary.md` — LLM-генерируемый дайджест ключевых событий |

### Квартальные summary

Генерируются отдельным скиллом (не частью основного pipeline).
Формат: narrative summary с ссылками на key events через record_id.
Не являются evidence-source — только навигация.

### Archival

Перемещение в archive — `git mv`, сохраняет историю.
Все evidence-ссылки на archived events остаются валидными (путь обновляется при archival).

---

## 9) Модель доступа

### Три профиля

| Профиль | Canon Read | Canon Write | Intake | Транскрипты |
|---------|-----------|-------------|--------|-------------|
| **Memory Curator** | Весь canon | Весь canon | Read + Write | Read |
| **Orchestrator** | Весь canon | Нет (делегирует curator-у) | Нет | Нет |
| **Role Agent** (субагент) | `agents/<own-role>/` | Нет | Нет | Нет |

### Правила

- Orchestrator имеет полный read-доступ к canon для формирования контекста.
- При spawn субагента orchestrator передаёт ему **только его срез**: файлы из `agents/<role>/`.
- Если субагенту нужен контекст из `user/*` — orchestrator **явно выбирает и передаёт** релевантные фрагменты. Субагент не видит `user/*` целиком.
- Memory Curator — единственный агент с write-доступом к `core/*`.
- Enforcement v1: **convention-based** — роли и ограничения прописаны в SOUL.md/BOOT.md каждого агента.
- Production hardening (v2): tool-level ACL, sandbox isolation для субагентов.

### Добавление нового агента

1. Создать папку `core/agents/<new-role>/` с 4 файлами (COURSE, PLAYBOOK, PITFALLS, DECISIONS).
2. Добавить запись в `core/agents/_index.md`.
3. Настроить SOUL.md/BOOT.md нового агента с указанием его access-профиля.

---

## 10) Миграция схемы

### Версионирование

- `schema_version` хранится в `core/system/CANON.md` frontmatter — единое место.
- Формат: `MAJOR.MINOR` (например `1.0`, `1.1`, `2.0`).

### Правила миграции

| Тип изменения | Пример | Действие |
|--------------|--------|---------|
| MINOR bump | Новое optional поле `tags` | Старые записи валидны без изменений |
| MAJOR bump | Переименование `type` → `record_type` | Нужен migration script |

### Процедура MAJOR миграции

1. Создать git tag `pre-migration-v{OLD}`.
2. Написать migration-документ в `core/system/migrations/migrate-{OLD}-to-{NEW}.md`.
3. Выполнить миграцию (скрипт или сессия Mnemo).
4. Запустить Phase D (Verify) для ре-манифестации всего канона.
5. Git commit + tag `post-migration-v{NEW}`.

### CANON.md frontmatter

```yaml
---
schema_version: "1.0"
life_day_timezone: "Europe/Moscow"
canon_scope: "workspace/memory/core/*"
single_writer: "mnemo"
created_at: "2026-03-05T00:00:00Z"
---
```

---

## 11) Интерфейсы скиллов OpenClaw

### Обзор скиллов

| Скилл | Тип | Trigger | Фаза pipeline |
|-------|-----|---------|---------------|
| `memory-extract` | LLM | По расписанию / manual | Phase A |
| `memory-curate` | LLM | После extract / manual | Phase B |
| `memory-apply` | LLM | После curate / manual | Phase C |
| `memory-verify` | Script | После apply / manual | Phase D |
| `memory-query` | LLM | On-demand | Runtime |
| `memory-status` | Script | Manual / scheduled | Diagnostics |
| `memory-onboard-agent` | Script | Manual | Setup |

### memory-extract

- **Input**: путь к session transcripts, дата (или `today`)
- **Output**: `intake/pending/YYYY-MM-DD.md`
- **System prompt** (в curator-runbook.md): извлечь атомарные claims из транскриптов, каждый claim — одно наблюдение с YAML-метаданными
- **Tools**: file_read, file_write, glob
- **Не загружает**: канон (только транскрипты → claims)

### memory-curate

- **Input**: `intake/pending/*.md` + текущий канон (relevant files)
- **Output**: аннотированный intake (accept/reject/defer + draft записей)
- **System prompt**: оценить claims vs канон, принять решения, подготовить draft
- **Tools**: file_read, file_write, glob
- **Не загружает**: транскрипты

### memory-apply

- **Input**: curated intake + целевые файлы канона
- **Output**: обновлённый канон + git commit
- **System prompt**: записать curated claims в канон с точным форматированием envelope
- **Tools**: file_read, file_write, glob, git (add, commit)
- **Checkpoint**: пишет `_checkpoint.yaml`, resume при crash

### memory-verify

- **Input**: файлы канона после commit
- **Output**: `meta/manifest.json` + edges append + git commit
- **Implementation**: shell-скрипт или Node.js (не LLM)
- **Actions**: checksums, record counts, edge extraction, validation

### memory-query

- **Input**: вопрос на естественном языке
- **Output**: релевантные записи канона с record_id
- **Implementation**: LLM + memory_search (OpenClaw built-in)
- **Tools**: file_read, memory_search, glob

### memory-status

- **Input**: нет
- **Output**: diagnostic report
- **Checks**: record counts, last manifest date, pending intake count, edge consistency, backlog alerts
- **Implementation**: скрипт

### memory-onboard-agent

- **Input**: role name
- **Output**: scaffold `agents/<role>/` + update `_index.md`
- **Creates**: 4 пустых файла (COURSE, PLAYBOOK, PITFALLS, DECISIONS) с template frontmatter
- **Implementation**: скрипт

### Curator-runbook.md как центральный скрипт

`core/system/curator-runbook.md` содержит:
1. Полную инструкцию по каждой фазе (A/B/C) — что читать, что писать, какие решения принимать.
2. Примеры claims и решений (accept/reject/defer).
3. Правила форматирования envelope и record contract.
4. Правила обработки конфликтов (supersedes, duplicate, contradicting facts).
5. Чеклист post-apply валидации.

При миграции на новую OpenClaw систему curator читает этот файл и может обслуживать память автономно.

---

## 12) Упаковка в плагин

### Структура плагина

```
packages/adapter-openclaw/
  openclaw.plugin.json                 # manifest: name, version, skills list
  skills/
    memory-extract/
      SKILL.md
    memory-curate/
      SKILL.md
    memory-apply/
      SKILL.md
    memory-verify/
      SKILL.md
      verify.sh                        # или verify.js
    memory-query/
      SKILL.md
    memory-status/
      SKILL.md
      status.sh
    memory-onboard-agent/
      SKILL.md
      onboard.sh
  templates/
    workspace-memory/                  # scaffold для workspace/memory/
      intake/
        pending/.gitkeep
        processed/.gitkeep
      core/
        system/
          CANON.md                     # pre-filled с инвариантами
          curator-runbook.md           # pre-filled с полным скриптом
        user/
          timeline/.gitkeep
          knowledge/
            preferences.md             # template с frontmatter
            skills.md
            work.md
            health.md
            social.md
            finance.md
          identity/
            current.md                 # template
            changelog.md
          state/
            current.md                 # template
        agents/
          _index.md                    # template
          nyx/
            COURSE.md
            PLAYBOOK.md
            PITFALLS.md
            DECISIONS.md
          medea/
            COURSE.md
            PLAYBOOK.md
            PITFALLS.md
            DECISIONS.md
          arx/
            COURSE.md
            PLAYBOOK.md
            PITFALLS.md
            DECISIONS.md
          lev/
            COURSE.md
            PLAYBOOK.md
            PITFALLS.md
            DECISIONS.md
          mnemo/
            COURSE.md
            PLAYBOOK.md
            PITFALLS.md
            DECISIONS.md
        meta/
          manifest.json                # initial empty manifest
          graph/
            edges.jsonl                # empty
  README.md
```

### Setup flow

1. `openclaw plugin install ./packages/adapter-openclaw`
2. Адаптер копирует `templates/workspace-memory/` в workspace пользователя.
3. Пользователь настраивает расписание для `memory-extract` (например, ежедневно 00:00).
4. Система готова к работе.

Время от нуля до работающей системы: **< 1 час**.

---

## 13) Runtime-индексация (справка, non-normative)

Runtime-индексы **не являются частью канона**. Они живут в `~/.openclaw/` и полностью rebuildable.

### Интеграция

- После каждого manifest update → dirty signal → background reindex.
- OpenClaw `memory_search` — дефолтный query interface.
- Каноничные пути подключаются через `agents.defaults.memorySearch.extraPaths`.
- Рекомендуемые пути для индексации:
  - `workspace/memory/core/user/timeline/**/*.md`
  - `workspace/memory/core/user/knowledge/*.md`
  - `workspace/memory/core/user/identity/*.md`
  - `workspace/memory/core/user/state/*.md`
  - `workspace/memory/core/agents/**/*.md`

### Что НЕ индексировать

- `intake/*` (сырые данные, не канон)
- `meta/*` (служебные файлы)
- `system/*` (инварианты, не knowledge)

Все детали SQLite/FTS5/vector/QMD — это документация OpenClaw, не часть memory spec.

---

## Чеклист «работает как часы»

- [ ] Каждый consolidation cycle: 3 LLM-сессии + 1 скрипт, строго последовательно
- [ ] Каждая LLM-сессия имеет узкий контекст (не мешает extraction с curation)
- [ ] Partial success: плохой claim не блокирует batch
- [ ] Checkpoint/resume: crash mid-apply → продолжение из checkpoint
- [ ] Нет записи в канон без evidence
- [ ] Коррекции только через append (не перезапись)
- [ ] Manifest обновляется после каждого успешного apply
- [ ] Git commit после каждого apply и каждого verify
- [ ] Curator-runbook.md содержит ВСЮ необходимую информацию для автономной работы
- [ ] Новый агент = 1 папка + 4 файла + запись в _index.md
- [ ] Миграция на новую систему = git clone → curator читает runbook → работает
- [ ] Backlog >7 дней → алерт
- [ ] Processed intake >90 дней → архив
- [ ] Edges compaction — квартально
- [ ] Timeline archive — ежегодно для файлов >1 года
