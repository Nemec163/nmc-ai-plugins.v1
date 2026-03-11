# Memory Design v1 (Final)

## 1) Цель
Построить долговременную память, которая:
- не смешивает runtime и канон;
- масштабируется на 100+ агентов;
- переживает клоны/миграции/переиндексации канона без потери трассируемости;
- остается практичной в ежедневной эксплуатации.

### Реальная продуктовая цель

Эта архитектура проектируется не как попытка “прокачать memory backend OpenClaw”,
а как **личный canon / second brain** о жизни, работе, проектах, решениях и паттернах пользователя,
который работает в паре с AI-ассистентом.

Приоритеты v1:
- долговечность и переносимость между агентскими системами без semantic lock-in;
- человеко-читаемость и ручная проверяемость канона;
- возможность открыть память как обычную базу знаний в Obsidian-подобных инструментах;
- возможность строить timeline / backlinks / graph visualization без проприетарного backend;
- возможность в любой момент просмотреть “дневник жизни” без участия конкретного AI runtime.

Следствие:
- Markdown + явный metadata envelope + links выбраны **осознанно** как vendor-neutral формат канона;
- runtime индексы, SQLite/QMD, embeddings, graphs и кэши — это ускорители recall, а не источник истины;
- оптимизируется не максимальная write-throughput производительность OpenClaw, а качество,
  переносимость и объяснимость долговременной памяти.

## 2) Привязка к OpenClaw Workspace

- Логическая единица `L0` в мультиагентном режиме: **операционный слой агента до канонизации**.
- Физически `L0` в v1 состоит из трех классов runtime-источников:
  1. агентский workspace runtime (`workspace/<agent>/`);
  2. операционные артефакты оркестратора (например `workspace/orchestrator/ops/*`, kanban/task board, handoff notes);
  3. runtime session transcripts вне канона (`~/.openclaw/agents/<agentId>/sessions/*.jsonl`).

- Внутри каждого `workspace/<agent>/` лежат агентские runtime/bootstrap файлы (`AGENTS.md`, `SOUL.md`, `USER.md`, `IDENTITY.md`, `TOOLS.md`, `BOOT.md`, `memory/*`).
- Общая долговременная память хранится в едином корне `workspace/memory/`:
  - `workspace/memory/intake/*`
  - `workspace/memory/core/*`

- `workspace/memory/core/*` — единственный переносимый memory-canon.
- `~/.openclaw/*` (config, credentials, sessions, managed skills, runtime indexes, ledgers) не является частью memory-canon и не коммитится в этот репозиторий.
- Runtime session transcripts и task-артефакты являются источниками наблюдений для curator pipeline, но не считаются частью переносимого канона.

### Целевая модель эксплуатации v1

Практическая модель системы в v1:
- пользователь общается **только с одним агентом-оркестратором**;
- оркестратор умеет спавнить ролевых агентов под отдельные задачи;
- у системы есть операционный слой task-management/kanban, живущий рядом с runtime-контекстом;
- OpenClaw по умолчанию пишет рабочую историю в session transcripts, и именно они являются главным сырьем для nightly consolidation.

Это означает:
- свежая информация текущего дня **нормально и ожидаемо** живет в `L0`, session history и операционных артефактах оркестратора;
- ролевые агенты не обязаны иметь “живую” собственную память вне своих рабочих сессий;
- канон не обязан быть real-time копией происходящего;
- nightly curator переводит достойную фиксации часть операционного слоя в `L2/L3/L4/L5`, после чего она становится canonical memory.

Иными словами:
- `L0` = живой operational layer (“что происходит прямо сейчас”),
- `core/*` = подтвержденный personal canon (“что уже стоит хранить как часть второго мозга”).

## 3) Нормативные принципы
- `L0` — это неканонический operational layer.
- `L0` MAY быть durably persisted в течение дня в виде session transcripts, task-артефактов и runtime notes,
  но не является source of truth долговременной памяти.
- `L1` хранит сырьевые claims до кураторского решения.
- Канон хранится в `workspace/memory/core/*` и обновляется только через curator-пайплайн.
- Intake хранится в `workspace/memory/intake/*`.
- Очистка `L0` / runtime-источников после успешной канонизации допустима,
  но MUST NOT быть механизмом идемпотентности или защиты от повторной обработки.
- Защита от повторной обработки MUST обеспечиваться через
  `claim_id` + runtime `source_watermark ledger` + runtime `apply_batch_id ledger`.
- `user/*` — единственное место для личных слоев `L2/L3/L4/L5`.
- `agents/*` — только competence canon роли (знания, паттерны, anti-mistakes), без role-local state слоев.
- В `agents/<role>/` каноничны файлы `COURSE.md`, `PLAYBOOK.md`, `PITFALLS.md`, `DECISIONS.md` (без дополнительных внутренних слоев).
- Все каноничные записи имеют единый мета-контракт (`record_id`, `evidence`, `updated_at`, и т.д.).
- `user/views/*` — это view-слой, а не первичный источник истины.

### Read-only канон

`workspace/memory/core/*` является канонической долговременной памятью системы.

Агенты могут **читать только те срезы канона, которые явно разрешены**
их `access-profile` / `retrieval-profile`;
модель чтения в v1 — **allowlist**, а не blanket-read.

При этом **ни один агент не имеет права записывать в неё напрямую**.

Единственный writer канона — **Memory Curator**.

---

### Политика одного писателя (Single Writer Policy)

Каноническая память обновляется **только одним агентом — Memory Curator**
через curator pipeline.

Другие агенты **никогда не записывают напрямую** в `workspace/memory/core/*`.

---

### Логический single-writer, а не запрет на fan-out

`Single Writer` означает **один publish-authority**, а не запрет на параллельную работу.

Memory Curator MAY использовать **вспомогательных subagents** в отдельных OpenClaw sessions
для extraction / normalization / pre-curation / conflict analysis.

Но в v1 MUST оставаться верны два правила:
- helper subagents не имеют write-доступа в `workspace/memory/core/*`;
- только **root-session Memory Curator** принимает финальное curator-решение,
  сериализует merge order и публикует batch `Apply -> Views -> Edges -> Manifest`.

Таким образом:
- fan-out на чтение/анализ разрешён;
- publish в канон остаётся строго single-writer.

---

### Модель ночной консолидации

Каноническая память обновляется **периодическими циклами консолидации**
(обычно **1 раз в сутки**, например в 00:00).

В течение дня канон остаётся неизменным.

---

### Правило дневной дельты

Все события, наблюдения, решения и изменения, происходящие в течение дня,
до следующего успешного publish существуют только в **операционном слое**:

- в runtime-контексте оркестратора,
- в session history,
- в task/kanban-артефактах,
- в необработанных runtime notes,
- в intake после extraction.

Они не считаются каноном до curator publish.

---

### Freshness Contract

`workspace/memory/core/user/L5_state/current.md` означает
**"current as of last successful manifest"**, а не speculative real-time truth.

Следовательно:
- канон отвечает на вопрос “что подтверждено сейчас на момент последней консолидации”;
- same-day дельта до следующего Apply живет только в `L0` / session history / task-артефактах / intake;
- runtime наблюдения MAY использоваться для оперативного ответа только если это разрешено профилем доступа,
  но такие наблюдения не становятся каноном до curator publish.

Для любых ответов про `now|today|current` система MUST различать:
- `canonical current` = подтвержденное состояние с `valid_time.as_of`;
- `runtime delta` = еще не сконсолидированное наблюдение.

---

### Временной контракт

Все машинные timestamps в каноне и `meta/*` MUST храниться в **RFC3339 UTC** с суффиксом `Z`.

Правила детерминизма:
- разбиение `L1/YYYY-MM-DD/` MUST вычисляться по UTC-дате `observed_at`;
- разбиение `L2_episodic/YYYY/MM/DD.md` MUST вычисляться по пользовательскому `life_day_timezone`,
  зафиксированному в policy/config для данного канона;
- каждый файл `L2_episodic` SHOULD явно указывать `day_timezone` и покрываемый `utc_span`;
- локальная timezone MAY использоваться в человеко-читаемых summary и в жизненном partitioning `L2`,
  но все машинные timestamps внутри записей и `meta/*` остаются UTC;
- scheduler может работать в локальной timezone окружения, но опубликованные артефакты канона всегда нормализуются в UTC.

---

### Разделение Runtime и Canon

Runtime память (`L0`) — это **операционный слой системы**
(что происходит сейчас).

Каноническая память (`workspace/memory/core/*`) — это
**подтверждённая и консолидационная память системы**
(что уже зафиксировано и подтверждено).

## 4) Итоговая структура
```text
workspace/
  orchestrator/                         # главный агент v1
    AGENTS.md
    SOUL.md
    USER.md
    IDENTITY.md
    TOOLS.md
    BOOT.md
    ops/                                # L0 operational artifacts (non-canonical)
      kanban.md
      current.md
      handoffs/
        2026-03-05.md
    memory/
      2026-03-05.md

  trader/                               # role agent example
    AGENTS.md
    SOUL.md
    USER.md
    IDENTITY.md
    TOOLS.md
    BOOT.md
    memory/
      2026-03-05.md

  designer/                             # role agent example
    AGENTS.md
    SOUL.md
    USER.md
    IDENTITY.md
    TOOLS.md
    BOOT.md
    memory/
      2026-03-05.md

  memory/
    intake/
      L1/
        2026-03-05/
          claim_000123.json            # пример имени; source of truth = claim_id внутри файла
          claim_000124.json
      queue/                           # статусы обработки intake (.ref ссылается на claim_id)
        new/
          claim_000124.ref
        normalized/
          claim_000123.ref
        curated/
          claim_000123.ref
        rejected/
          claim_000099.ref
        applied/
          claim_000123.ref

    core/
      system/
        CANON.md
        policies/
          curator.md
          access.md
          retention.md
          redaction.md
          conflicts.md
        schemas/
          event.schema.json
          fact.schema.json
          edge.schema.json

      meta/
        manifests/                     # обязательно
          index_manifest_20260305T101530Z.json
        edges/                         # производный реестр ребер (graph-export ready)
          edges_20260305T101530Z.jsonl
        tombstones/                    # опционально (рекомендуется для критичных доменов)
          tombstone_pref_coffee_roast_20260305T081200Z.json

      agents/
        _index.md
        trader/
          COURSE.md
          PLAYBOOK.md
          PITFALLS.md
          DECISIONS.md
          history/
            2026-03.md
        designer/
          COURSE.md
          PLAYBOOK.md
          PITFALLS.md
          DECISIONS.md
          history/
            2026-03.md

      user/
        L2_episodic/                   # canonical diary / append-only events
          2026/
            03/
              05.md
              06.md
          2025/
            11/
              12.md
          2024/
            08/
              21.md
        L3_semantic/                   # доменные md-файлы с типовыми блоками записей
          preferences.md
          skills.md
          beliefs.md
          social.md
          health.md
          work.md
          finance.md
        L4_identity/
          current.md
          update_log.md
        L5_state/
          current.md

        views/
          timeline_overview.md
          life_areas_index.md
          current_summary.md
```

В v1 отдельный `journal/` слой намеренно не вводится.
Роль канонического “дневника жизни” выполняет `user/L2_episodic/*`.

## 5) Почему `manifests` и `tombstones`

### `meta/manifests/` (обязательно)
Решает проблему “неизвестно, что именно сейчас в индексе”.
Минимум, который фиксируется:
- `source_commit` (из какого commit собран индекс);
- `schema_version`;
- `build_time`;
- `record_counts` по ключевым слоям;
- `checksums` (или hash-дерево) канона.

Практический эффект:
- можно доказать полноту/валидность после `clone + reindex`;
- можно сравнить parity между окружениями;
- можно детектить index drift.

### `meta/tombstones/` (включать по необходимости)
Решает проблему “удаленное/исправленное знание вернулось из старого snapshot/merge”.
Tombstone фиксирует:
- что запись снята с действия;
- причину;
- `superseded_by` (если есть замена);
- время и источник решения.

Практический режим v1:
- `manifests` включены всегда;
- `tombstones` включаются для global/критичных доменов, где ошибка дорогая.

## 6) Контракт каноничной записи (обязательные поля + graph-ready расширения)
Для любых каноничных записей в `workspace/memory/core/agents/*/{COURSE,PLAYBOOK,PITFALLS,DECISIONS}.md` и в `workspace/memory/core/user/L2_episodic/*`, `workspace/memory/core/user/L3_semantic/*`, `workspace/memory/core/user/L4_identity/*`, `workspace/memory/core/user/L5_state/*`:

```yaml
record_id: "uuid-or-stable-id"
record_type: "event|fact|competence|identity|state"
schema_version: "1.0"
created_at: "2026-03-05T10:15:30Z"
updated_at: "2026-03-05T10:15:30Z"
created_by: "memory-curator@v1" # optional
natural_key: "fact:user.preference.coffee_roast" # MUST for all non-event records in v1
valid_time:                                      # MUST for state/identity in v1
  as_of: "2026-03-05T10:15:30Z"
source_event_id: null                            # MUST for state in v1
source_provenance:                               # MUST for all canonical records
  source_kind: "orchestrator_session"
  source_id: "session_2026-03-05_main"
  source_fingerprint: "sha256:abc123"
  observed_at: "2026-03-05T10:15:30Z"
  extractor_version: "extractor@v1"
source_ref:                                      # optional pointer to retained intake/runtime source
  - "workspace/memory/intake/L1/2026-03-05/claim_000123.json"
evidence:
  - "rid:uuid-event-1"
  - "path:workspace/memory/core/user/L2_episodic/2026/03/05.md#event_uuid-event-1"
links:                                           # optional in v1, typed outgoing edges by record_id
  - rel: "caused" # enum: caused|updated|produced|supersedes|evidence_of|derived_from|influenced_by|supports
    target_record_id: "uuid-state-change-1"
confidence: 0.6
supersedes: null
status: "event=active|corrected|retracted; fact|state|identity|competence=active|deprecated|retracted"
```

Тип-специфичные обязательные поля:
- для `record_type=event` MUST дополнительно присутствовать:
  - `event_type`
  - `timestamp`
  - `payload`
- для `record_type=fact` MUST дополнительно присутствовать:
  - `natural_key`
  - `subject`
  - `predicate`
  - `value`
- для `record_type=state` MUST дополнительно присутствовать:
  - `natural_key`
  - `subject`
  - `predicate`
  - `value`
  - `source_event_id`
- для `record_type=identity` MUST дополнительно присутствовать:
  - `natural_key`
  - `subject`
  - `predicate`
  - `value`
- для `record_type=competence` MUST дополнительно присутствовать:
  - `natural_key`
  - `domain`
  - `role`
  - `scope`

Примечание:
общий YAML-пример выше показывает cross-type metadata contract;
`source_provenance` обязателен для всех каноничных записей как долговечный provenance-minimum;
type-specific обязательные поля валидируются соответствующими schema-файлами.

Примечания:
- `record_id`, `source_provenance`, `evidence`, `updated_at`, `supersedes` — обязательный минимум.
- `source_ref` является optional best-effort pointer на retained intake/runtime source и MAY стать недоступным после retention/GC;
  долговечная трассируемость MUST обеспечиваться через `source_provenance`, а не через вечную доступность `source_ref`.
- `natural_key` MUST для всех non-event записей (`fact|state|identity|competence`) уже в v1.
- `natural_key` MUST быть нормализован: lowercase, разделители только `:` и `.`, без пробелов; минимум `record_type + domain + slot` (например `state:user.current_location`).
- в одном опубликованном snapshot MUST существовать **не более одной** `active`-записи на один `natural_key`
  для всех non-event слоев, если только доменная policy явно не разрешает multi-valued slot;
  в v1 multi-valued значения SHOULD моделироваться разными `natural_key` или одним `value`-массивом, а не несколькими active-записями на один ключ.
- `valid_time.as_of` MUST для `state|identity` уже в v1.
- все timestamps в metadata MUST быть RFC3339 UTC (`...Z`);
- `evidence[*]` поддерживает два формата: `rid:<record_id>` (канонический) и `path:<path>#<anchor>` (человеко-удобный).
- `source_provenance` отвечает за происхождение сырья, `evidence` — за обоснование канонического вывода;
  для `record_type=state|identity` `evidence` MUST включать хотя бы один `rid:` на supporting `L2` event.
- `created_by` — опциональное (рекомендуемое) поле для фиксации curator pipeline, создавшего запись.
- `created_by` упрощает аудит и воспроизводимость генерации памяти.
- `confidence` обязателен и назначается только curator pipeline по дискретной шкале `0.3 | 0.6 | 0.9` (`low | medium | high`).
- рекомендуемая калибровка confidence:
  - `0.3`: одиночное / слабое / неоднозначное наблюдение, еще не тянущее на устойчивый вывод;
  - `0.6`: достаточно надежный curated вывод из одного сильного или нескольких согласованных сигналов;
  - `0.9`: сильное подтверждение из нескольких независимых evidence или явного авторитетного источника;
- `status` нормируется по `record_type`: `event -> active|corrected|retracted`; `fact|state|identity|competence -> active|deprecated|retracted`.
- `links[*].rel` в v1 фиксируется enum-ом: `caused | updated | produced | supersedes | evidence_of | derived_from | influenced_by | supports`.
- `links[*].target_record_id` всегда указывает на `record_id` (path/anchor в ссылке опциональны и остаются человеко-читаемым удобством).
- `supersedes` и `links rel=supersedes` синхронизируются двусторонне: если задано одно, MUST быть задано второе на тот же `record_id`.
- future-proof: `target_record_id` может ссылаться как на “узел-запись”, так и на отдельную relation-entity запись (`record_type=relation`, если будет введен позже).
- `L2_episodic` остается append-only: исправления добавляются отдельной `correction_*` записью в дневном файле (или на следующий день).

### 6.1 Канонический Markdown envelope (MUST)

Schema валидирует объект записи, но канон в v1 хранится в Markdown.
Поэтому каждая каноничная markdown-запись MUST иметь единый envelope:
1. explicit anchor,
2. fenced YAML metadata block,
3. optional human-readable body.

Правила envelope:
- для событий `L2` anchor MUST быть `event_<record_id>`; рекомендуемая форма: `<a id="event_<record_id>"></a>`,
- для остальных типов записей рекомендуется anchor `record_<record_id>` в форме `<a id="record_<record_id>"></a>`,
- parser MUST опираться только на explicit envelope, а не на renderer-generated heading anchors,
- serializer MUST обеспечивать round-trip без потери обязательных полей,
- serializer MUST обеспечивать детерминированный порядок записей и byte-stable canonical files
  при отсутствии семантических изменений входных данных,
- `path:...#<anchor>` в `evidence` MUST ссылаться на explicit anchor из envelope.

## 7) Правила по слоям
- `L0`: это операционный слой до канонизации; физически он включает `workspace/<agent>/`, операционные артефакты оркестратора и runtime session transcripts. `L0` не является каноном.
- `L1`: `workspace/memory/intake/*` + очередь статусов `new -> normalized -> curated/rejected -> applied`.
- `user/L2`: `workspace/memory/core/user/L2_episodic/YYYY/MM/DD.md` —
  это канонический дневной файл и основной “дневник жизни” системы.

  Каждый файл L2 SHOULD иметь структуру:
  1. заголовок дня;
  2. metadata о `day_timezone` и покрываемом `utc_span`;
  3. краткий human-readable `Day Summary`;
  4. блок `Canonical Events` с explicit-envelope записями.

  Обязательные правила:
  - каждое событие MUST иметь явный `record_id` и explicit anchor `event_<record_id>`;
  - parser и evidence-система MUST опираться только на explicit event envelopes;
  - `Day Summary` является narrative scaffold для человека, но не является самостоятельным evidence-источником;
  - append-only инвариант применяется к canonical event envelopes;
  - `Day Summary` MAY детерминированно пересобираться при publish того же дня или при поздней коррекции,
    если это не нарушает содержимое уже опубликованных event-записей.
- `user/L3`: `workspace/memory/core/user/L3_semantic/*.md` по доменам (`preferences.md`, `skills.md`, и т.д.) с типовыми блоками записей; активные записи L3 MUST иметь `natural_key`, а upsert/supersede-семантика в этих файлах определяется по `natural_key`.
- `user/L4`: `workspace/memory/core/user/L4_identity/{current.md,update_log.md}`; `current.md` хранит только последнюю утвержденную identity-проекцию, `update_log.md` — историю изменений.
- `user/L5`: `workspace/memory/core/user/L5_state/current.md`; `record_type=state` MUST иметь `source_event_id` и быть только проекцией `L2`; файл содержит только latest active state per `natural_key` на момент последнего successful manifest; speculative runtime overlay сюда не пишется; markdown-сводки генерируются как views.
- для `record_type=state` canonical links: `derived_from -> source_event_id`, а при версии-замене добавляется `supersedes -> previous_state_record_id`.
- для записей версионирования `supersedes` и `links rel=supersedes` MUST оставаться консистентными (без расхождения).
- `agents/*`: `workspace/memory/core/agents/*` хранит только роль-специфичную компетенцию и anti-mistakes в `COURSE.md`, `PLAYBOOK.md`, `PITFALLS.md`, `DECISIONS.md`; competence-записи в этих файлах MUST иметь `natural_key`, а их upsert/supersede-семантика определяется по `natural_key`.
- `agents/*/history`: опционально, создается только при явной необходимости.

### Runtime Recall Rule

Во время работы агенты формируют рабочий контекст следующим образом:

```text
L0 runtime context
+ authorized snapshot of canonical memory (только разрешенные пути/домены)
+ role competence (agents/<role>/, если входит в allowlist профиля)
```

Каноническая память представляет собой **последний подтверждённый снимок системы**,
полученный после последнего цикла консолидации и доступный агенту
только в пределах разрешенного профилем среза.

События текущего дня остаются в **операционном слое**
до следующей ночной консолидации.

Интерпретация freshness:
- `L5/current.md` читается как “подтверждено на `valid_time.as_of`”;
- для ответов про `now|today|current` агент MUST либо явно опираться на канон с этим `as_of`,
  либо отдельно использовать разрешенную runtime delta и помечать ее как неканоничную;
- runtime delta не может быть silently смешана с каноном так, будто это уже опубликованный `L5`.
- authoritative чтение канона в момент publish SHOULD опираться на последний успешный `manifest`; чтение файлов, обходя publish discipline, MAY увидеть промежуточное состояние и не считается authoritative.

## 8) Пайплайн консолидации

0. `Nightly Intake (Operational Sources → L1)`

Memory Curator запускается по расписанию (обычно один раз в сутки, например в 00:00)
и проходит по новым или изменившимся runtime-источникам наблюдений.

В v1 источники наблюдений имеют следующий приоритет:
1. session transcripts оркестратора;
2. операционные task-артефакты оркестратора (например kanban/task board, handoff notes);
3. session transcripts ролевых агентов;
4. иные разрешенные runtime notes / tool-derived operational artifacts.

Runtime-источники не являются частью канона.
Они используются только как operational source layer для extraction и short replay buffer.

Пример источника:

```text
sessions/YYYY-MM-DD-<session>.jsonl
```

или другой формат session transcripts, используемый текущей версией OpenClaw.

### Рекомендуемый flow для dedicated curator

В v1 консолидацией занимается **выделенный Memory Curator profile** на сильной модели
с большим контекстным окном (например GPT-5.4-class или эквивалентный high-intelligence profile).

Практическое правило:
- у curator одна задача: качественно пополнять канон;
- каждый этап запускается в **fresh session** с узкой целью;
- не стоит делать один длинный “универсальный” mega-run на всю ночь;
- качество curator-решений важнее избыточной автоматической сложности.

Рекомендуемая цепочка этапов:
1. `Scope Session`: определить диапазон новых orchestrator/role sessions и task-артефактов, зафиксировать batch scope.
2. `Extraction Session`: извлечь атомарные claims из transcripts и task-источников в `L1`.
3. `Normalize Session`: нормализовать формулировки, схлопнуть дубликаты по `claim_id` / `normalized_claim_hash`, убрать шум.
4. `Curation Session`: решить, что является event/fact/state/identity/competence, что отклонить, что отложить в conflict-review.
5. `Draft Session`: подготовить детерминированный набор канонических записей и апдейтов для `L2/L3/L4/L5` без publish.
6. `Apply Session`: выполнить schema-validation и manifest-gated publish в `core/*`, затем `Views -> Edges -> Manifest`.
7. `Review Session` (опционально): собрать короткий curator report с числом новых событий, фактов, state-change, rejects и conflict items.

Принцип оптимизации:
- ранние этапы должны быть максимально read-heavy и reversible;
- write-authority в `core/*` нужна только на финальном `Apply Session`;
- если этап не прошел validation/conflict threshold, batch лучше defer/reject, чем публиковать шум;
- flow должен быть простым, повторяемым и пригодным для ежедневного выполнения без ручного микроменеджмента.

### Runtime Source Ledger (обязательно)

Повторная обработка runtime-источников MUST контролироваться не их удалением,
а отдельным runtime `source_watermark ledger`, живущим вне `workspace/memory/*`
(например `~/.openclaw/memory/curator/source_ledger.sqlite`
или `~/.openclaw/memory/curator/source_ledger.jsonl`).

Минимальные поля source ledger:
- `source_id`
- `source_kind`
- `source_path`
- `source_fingerprint`
- `processed_span`
- `status`
- `apply_batch_id`
- `processed_at`

Где:
- `source_kind` = `orchestrator_session | role_session | task_artifact | runtime_note | tool_output`
- `processed_span` = диапазон turns / lines / revision-span, который уже обработан
- `source_fingerprint` = детерминированный hash содержимого или стабильный source-version marker

Правила:
- повторная обработка MUST определяться по `source_watermark ledger`, а не по наличию/отсутствию source-файла;
- очистка runtime-источников MAY выполняться только после успешного `Manifest write`
  и успешного commit в `source_watermark ledger`;
- cleanup является garbage collection, а не механизмом консистентности.

### Правила extraction

Memory Curator:
1. Получает список новых или изменившихся runtime-источников по `source_watermark ledger`.
2. Для каждого source-unit выполняет extraction.
3. Разбивает содержимое на атомарные claims.

Каждый source-unit (session transcript, task artifact snapshot, runtime note snapshot)
обрабатывается как отдельная extraction-unit.

Fan-out rule:
- extraction / normalization / первичная curator-оценка MAY выполняться параллельно helper subagents;
- queue-status transitions и publish в `core/*` MUST оставаться сериализованными root-curator session;
- merge результатов helper subagents MUST быть детерминированным (stable order по времени, затем по id).

### Результат extraction

Claims записываются в:

```text
workspace/memory/intake/L1/YYYY-MM-DD/
```

и регистрируются в:

```text
workspace/memory/intake/queue/new
```

Этот этап **не изменяет каноническую память**,
а только **извлекает наблюдения**.

Имя файла (например `claim_000123.json`) может оставаться удобным файловым идентификатором,
но source of truth для identity claim — поле `claim_id` внутри файла.

Queue `.ref` MUST ссылаться на `claim_id`, а не на позиционное имя файла.

Минимальный контракт claim в `L1`:
- `claim_id`
- `source_kind`
- `source_actor_id`
- `source_id`
- `source_path`
- `source_span`
- `source_fingerprint`
- `extractor_version`
- `normalized_claim_hash`
- `observed_at`
- `payload`

Дополнительно:
- `claim_id` MUST быть детерминированным **в пределах одного `extractor_version`**
  для одинакового `source_fingerprint + source_span + canonicalized payload`;
- рекомендуемая функция идентичности v1:
  `claim_id = hash(extractor_version, source_id, source_span, canonicalized_payload)`;
- cross-version стабильность `claim_id` не гарантируется;
  при смене extractor/model/prompt replay-safe дедупликация MUST дополнительно опираться на `normalized_claim_hash`;
- повторное извлечение того же claim в пределах одного `extractor_version`
  MUST приводить к тому же `claim_id` и дедуплицироваться до `Apply`;
- один и тот же source-unit MAY быть безопасно переобработан;
  replay-safe поведение обеспечивается через `source_watermark ledger` + `claim_id` + `normalized_claim_hash`,
  а не через обязательное удаление source-файлов.

### Важное правило

Runtime-источники наблюдений являются **источником наблюдений (observations)**,
но **не являются канонической памятью**.

Они используются **только для извлечения фактов и событий**,
которые затем проходят curator pipeline.

1. `Collect`: claim попадает в `workspace/memory/intake/L1/*` и `workspace/memory/intake/queue/new`.
2. `Normalize`: нормализация + дедупликация по `claim_id` + перенос в `workspace/memory/intake/queue/normalized`.
3. `Curate`: решение `curated` или `rejected`.
4. `Apply`:
   - выполняется **отдельной сессией после завершения Nightly Intake**;
   - Memory Curator обрабатывает curated claims, создаёт записи в `L2` и обновляет `L3/L4/L5`;
   - append в `workspace/memory/core/user/L2_episodic/YYYY/MM/DD.md` (если это событие);
   - upsert в `workspace/memory/core/user/L3_semantic/*.md` по `natural_key` (если это устойчивый факт);
   - update `workspace/memory/core/user/L4_identity/current.md` и `update_log.md` (при достаточном evidence);
   - update `workspace/memory/core/user/L5_state/current.md` (только как проекция событий).
5. `Role course update`: обновление `workspace/memory/core/agents/*/{COURSE,PLAYBOOK,PITFALLS,DECISIONS}.md` по итогам курации с merge/upsert по `natural_key`.
6. `Views build`: генерация `workspace/memory/core/user/views/*`.
7. `Edges build`: генерация `workspace/memory/core/meta/edges/edges_<manifest_utc>.jsonl` как полного актуального snapshot активных canonical edges на момент текущего `apply_batch_id`; файл публикуется в том же batch, что и manifest, и при dangling `src/dst` (`record_id` отсутствует в текущем снимке) этап MUST fail-closed.
8. `Manifest write`: запись нового `workspace/memory/core/meta/manifests/*`; manifest является финальным publish-marker batch-а и MUST выполняться только после успешного `Apply + Views build + Edges build`.
9. `Source Ledger Commit & Cleanup` (post-publish, non-canonical):
   - Memory Curator фиксирует в runtime `source_watermark ledger`,
     какие source-units и какие spans успешно закрыты данным `apply_batch_id`;
   - после этого processed runtime-источники MAY быть архивированы, очищены или удалены
     согласно `retention.md`;
   - отсутствие cleanup MUST NOT приводить к повторной канонизации тех же данных;
   - при crash между `Manifest write` и `Source Ledger Commit`
     система MUST уметь безопасно replay/re-scan без дублирования канона.

## 9) Режим миграций (практичный)

Гарантия `clone / migrate / reindex` в v1 распространяется **на canonical memory**,
а не на in-flight frontier runtime ingestion.

Базовый сценарий допускается:
- `git clone`
- `reindex --full`

Но прод-валидность канона подтверждается только при наличии актуального `manifest`:
- commit совпадает;
- counts/checksums совпадают;
- schema_version совместима.

Дополнительные правила:
- runtime ledgers (`apply_batch_id ledger`, `source_watermark ledger`) не являются частью канона и по умолчанию не переносятся через git;
- отсутствие этих ledger-ов после миграции MUST NOT повреждать уже опубликованный канон;
- после миграции новый deployment MAY начать с пустого runtime frontier и обрабатывать только будущие runtime-источники;
- exact continuation intake/replay после миграции MAY поддерживаться отдельным `frontier export/import` механизмом плагина,
  но это runtime state, а не часть memory-canon.

При включенных `tombstones` удаленные/замененные записи не “воскресают” в merge/replay сценариях.

## 10) Документация по `system/*` и `meta/*` (хирургический контракт)

Ниже фиксируется назначение **каждой папки и каждого файла** из целевого блока:

```text
system/
  CANON.md
  policies/
    curator.md
    access.md
    retention.md
    redaction.md
    conflicts.md
  schemas/
    event.schema.json
    fact.schema.json
    edge.schema.json
meta/
  manifests/
    index_manifest_20260305T101530Z.json
  edges/
    edges_20260305T101530Z.jsonl
  tombstones/
    tombstone_pref_coffee_roast_20260305T081200Z.json
```

### 10.1 `system/`

`system/` — нормативное ядро памяти. Здесь хранятся только:
- правила (что разрешено/запрещено),
- валидаторы структуры данных (JSON Schema).

Требование надежности:
- любое изменение в `system/*` должно применяться как версия контракта (`schema_version`),
- при несовместимости — fail-closed (остановка Apply с явной ошибкой).

### 10.2 `system/CANON.md`

Назначение: единый source-of-truth по инвариантам памяти.

Обязательные разделы:
- `Scope`: какие пути считаются каноном (`workspace/memory/core/*`).
- `Single Writer`: только Memory Curator пишет в канон.
- `Writer Authority`: helper subagents допустимы, но publish-authority остается только у root-curator session.
- `Layer Invariants`: append-only для L2, projection-only для L5, evidence-first для L3/L4.
- `Operational Source Boundary`: runtime sources (`~/.openclaw/*`, task-артефакты, runtime notes) не являются каноном; они служат только источниками наблюдений до curator publish.
- `Diary Contract`: роль канонического дневника жизни выполняет `user/L2_episodic/*`; human-readable day summaries допустимы в L2-файлах, но machine evidence опирается только на explicit event envelopes.
- `Freshness Contract`: `L5` интерпретируется как `current as of valid_time.as_of`, а same-day runtime delta не подменяет канон.
- `Record Contract`: обязательные поля (`record_id`, `updated_at`, `evidence`, `status`) + graph-ready поля (`natural_key`, `valid_time`, `links`).
- `Natural Key Contract`: `natural_key` обязателен для всех non-event records, нормализован (`<record_type>:<domain>.<slot>`, lowercase, без пробелов) и стабилен между apply-циклами.
- `Natural Key Uniqueness`: в одном published snapshot по умолчанию не более одной `active` записи для одного `natural_key` во всех non-event слоях; исключения MUST быть явно разрешены доменной policy.
- `Relation Truth`: source of truth по связям — только `links[]` в записях; `meta/edges/*` — производный snapshot-export/кэш.
- `Consolidation Contract`: последовательность `Collect -> Normalize -> Curate -> Apply -> Views -> Edges -> Manifest`.
- `Publish Model`: v1 использует manifest-gated single-writer publish; multi-file file-level atomicity не обещается, если deployment не реализует versioned snapshots / atomic pointer switch.
- `Post-Publish Runtime Contract`: после `Manifest write` допускаются `source ledger commit` и cleanup runtime-источников, но они не являются частью canonical publish batch.
- `Time Contract`: все машинные времена нормализуются в UTC; `L1` partitioning ведется по UTC, а `L2_episodic` partitioning — по пользовательскому `life_day_timezone`.
- `Deterministic Serialization`: одинаковый semantic input должен собираться в тот же canonical byte-layout первичных файлов.
- `Failure Contract`: что делать при ошибке (не обновлять manifest при неполном `Apply/Views/Edges`; batch без нового manifest считается некоммитнутым).

Правило наполнения:
- минимум: только MUST-правила;
- расширение: примеры валидных/невалидных записей и таблица кодов ошибок.

### 10.3 `system/policies/`

`policies/` — исполняемые организационные правила curator pipeline.

#### `system/policies/curator.md`
Отвечает за поведение куратора на каждом шаге пайплайна.

Фиксировать:
- вход/выход каждого этапа,
- критерии `curated` vs `rejected`,
- идемпотентность на двух уровнях: `claim_id` для intake dedupe и `apply_batch_id` для publish dedupe,
- допустимость helper subagents для fan-out этапов при сохранении одного publish-authority у root-curator,
- двухфазный Apply (MUST): `Phase 1 (staging)` — собрать все новые файлы/патчи и пройти schema-validation; `Phase 2 (publish)` — под single-writer lock детерминированно записать validated target files в canonical root; в v1 commit-marker = `Manifest write`, а не обещание глобального multi-file atomic switch; deployment MAY реализовать более сильный snapshot publish (`snapshots/<manifest_id>` + atomic pointer switch), но это optional hardening,
- `apply_batch_id` фиксируется одновременно в `manifest` и runtime `applied ledger` (file/sqlite) в runtime-path (например `~/.openclaw/memory/applied_ledger.sqlite` или `~/.openclaw/memory/curator/applied_ledger.jsonl`), строго вне `workspace/memory/*` и вне git, для детерминированного recovery после crash (`replay-safe` или `already-applied skip`),
- отдельный runtime `source_watermark ledger` MUST фиксировать, какие runtime-источники и какие spans уже безопасно закрыты конкретным `apply_batch_id`,
- processed runtime-источники MUST NOT удаляться до успешного `Manifest write` и успешного commit в `source_watermark ledger`,
- cleanup runtime-источников является post-publish garbage collection,
- идемпотентность MUST обеспечиваться через `claim_id` + `apply_batch_id ledger` + `source_watermark ledger`, а не через удаление source-файлов,
- replay после crash между publish и cleanup MUST быть safe,
- порядок обработки (детерминированный, стабильная сортировка по времени + id),
- детерминированную сериализацию файлов (`L2`: по `timestamp, record_id`; `L3/L4/L5`: по `natural_key, updated_at, record_id`, если применимо),
- обязательный `full reindex` при смене fingerprint (`provider/model/endpoint/chunking`) без частичных “догрузок”,
- `views/*` не используется как evidence для `L3/L4/L5` (только навигация/чтение),
- повторное извлечение того же claim в пределах одного `extractor_version` MUST схлопываться по `claim_id` до входа в `Apply`; межверсионная дедупликация SHOULD дополнительно использовать `normalized_claim_hash`,
- после успешного `Apply + Views build` MUST выполняться `Edges build` (без пропусков),
- `meta/edges/*` MUST быть синхронизирован с тем же `apply_batch_id`, что и соответствующий manifest,
- `meta/edges/*` в v1 публикуется как полный snapshot активных canonical edges, а не как delta-log текущего apply batch,
- `Edges build` MUST проваливаться (fail-closed), если любой `src/dst` не существует в каноничном snapshot текущего Apply,
- `Manifest write` MUST выполняться только после успешного `Apply + Views build + Edges build` и является финальным publish-marker batch-а,
- для `record_type=state` ссылка `derived_from` MUST указывать на тот же `record_id`, что и `source_event_id` (проверка на шаге curator validation),
- для всех non-event records MUST проверяться uniqueness активного `natural_key` в пределах публикуемого snapshot, если доменная policy явно не разрешает multi-valued slot,
- при наличии `supersedes` значение MUST совпадать с `links[].target_record_id` для `rel=supersedes` (проверка на шаге curator validation),
- внешние graph backends (Neo4j/TerminusDB/TypeDB и т.д.) трактуются как runtime index; source of truth остается в markdown/json каноне.

#### `system/policies/access.md`
Отвечает за модель прав и запретов.

Фиксировать:
- матрицу `actor x path x action`,
- явный deny на запись в `core/*` для всех кроме Memory Curator,
- allowlist-модель чтения: агент читает только пути/домены, разрешенные его `access-profile` / `retrieval-profile`,
- минимальное enforcement v1: path-scoped tool policy + retrieval/index allowlists + deny на write-tools для `core/*`,
- retrieval/index слой MUST наследовать те же path/domain ограничения, что и прямое чтение файлов;
- embeddings/cache для restricted путей не должны переиспользоваться агентами вне того же access-boundary,
- режим аудита (кто и когда читал/писал критичные файлы),
- POSIX perms/ACL и отдельный curator-service account допустимы как production hardening, но не являются обязательным условием текстового v1-guideline,
- отдельное правило для `views/*`: read-only, non-authoritative, без права быть источником `evidence`.

#### `system/policies/retention.md`
Отвечает за сроки хранения и архив.

Фиксировать:
- TTL для intake (`L1`, queue),
- `source_ref` MAY указывать на intake/runtime artifacts с ограниченным retention; долговечная provenance-связь должна сохраняться через `source_provenance`,
- бессрочность или регламент для канона,
- правила архивации и восстановления,
- запрет физического удаления канона без tombstone/аудита (для критичных доменов),
- runtime session transcripts и task-артефакты MAY храниться как short replay buffer вне канона,
- processed runtime-источники MAY архивироваться или удаляться только после успешного publish и source-ledger commit,
- GC intake/runtime sources не должен ломать трассируемость уже опубликованного канона, потому что минимальный provenance сохраняется в `source_provenance`,
- рекомендуемый replay window v1: 3–7 дней,
- deployment MAY установить aggressive mode (`0-day replay window`),
  но только при принятом риске невозможности позднего forensic replay.

#### `system/policies/redaction.md`
Отвечает за обработку чувствительных данных.

Фиксировать:
- классы данных (`public`, `internal`, `sensitive`, `restricted`),
- правила редактирования (`mask/hash/remove/tokenize`),
- момент применения редактирования (до попадания в L2/L3/L4/L5),
- redaction/retract MUST инвалидировать или пересобирать все runtime индексы/кэши, содержащие доредактированное содержимое,
- запрет публикации не-редактированных значений в `views/*`.

#### `system/policies/conflicts.md`
Отвечает за разрешение конфликтующих фактов/состояний.

Фиксировать:
- типы конфликтов (temporal, semantic, source-priority),
- стратегию разрешения (supersede/retract/defer-to-review),
- обязательную привязку решения к evidence,
- обязательную генерацию tombstone для retract в критичных доменах.

### 10.4 `system/schemas/`

`schemas/` — формальная валидация структуры записей, чтобы pipeline не принимал “почти правильные” данные.

#### `system/schemas/event.schema.json`
Отвечает за валидацию событий (L2).

Минимально обязательные поля:
- `record_id` (уникальный id),
- `record_type=event`,
- `event_type`,
- `timestamp` (UTC, RFC3339),
- `payload` (object),
- `source_provenance`,
- `evidence` (непустой массив ссылок),
- `confidence` (`MVP: 0..1; Production: enum 0.3|0.6|0.9`),
- `status` (`active|corrected|retracted`),
- `updated_at`.

Рекомендации надежности:
- `natural_key` для событий OPTIONAL в v1 и используется только если домену нужен stable semantic event key,
- `links[]` с `target_record_id` для явной причинности/event-graph,
- `evidence[*]` в формате `rid:<record_id>` (предпочтительно) или `path:<path>#<anchor>` для человеко-читаемой навигации,
- `additionalProperties: false` для критичных объектов,
- строгие `enum` и `format`,
- явные правила для `correction_of`/`supersedes`,
- в markdown-представлении L2 каждое событие MUST иметь explicit anchor `event_<record_id>`; рекомендуемая форма — `<a id="event_<record_id>"></a>`, не зависящая от форматирования файла.

#### `system/schemas/fact.schema.json`
Отвечает за валидацию фактов/состояний (L3/L5).

Минимально обязательные поля:
- `record_id`,
- `record_type=fact|state|identity|competence` (по выбранной модели),
- `natural_key` (MUST для всех non-event records в v1),
- `subject`,
- `predicate`,
- `value`,
- `source_provenance`,
- `evidence`,
- `links` (опционально в v1, но для `record_type=state` MUST содержать минимум `rel=derived_from`),
- `confidence` (`MVP: 0..1; Production: enum 0.3|0.6|0.9`),
- `updated_at`,
- `status` (`active|deprecated|retracted`).

Production-контракт (strict, fail-closed):
- `oneOf` MUST разделять ветки по `record_type`, чтобы схема отбрасывала кривые формы до Apply.
- общие поля MUST быть объявлены в верхнеуровневом `properties`, чтобы при `unevaluatedProperties: false` валидатор не рубил корректные записи как “не evaluated”.
- `source_provenance` MUST быть обязательным во всех ветках.
- `record_type=fact` MUST требовать `natural_key`.
- `record_type=state` MUST требовать `source_event_id` (L5 всегда проекция из L2).
- `record_type=state` MUST иметь `natural_key`, `valid_time.as_of` и в schema требовать `links contains rel=derived_from`; равенство `links[].target_record_id == source_event_id` проверяется на этапе curator validation.
- `record_type=identity` MUST требовать `natural_key` и `valid_time.as_of` в формате RFC3339 UTC.
- `record_type=competence` MUST требовать `natural_key`, `domain`, `role`, `scope`.
- `evidence` MUST быть непустым массивом во всех ветках.
- `evidence[*]` MUST соответствовать одному из форматов: `rid:<record_id>` или `path:<path>#<anchor>`.
- `links[*].rel` MUST быть одним из: `caused | updated | produced | supersedes | evidence_of | derived_from | influenced_by | supports`.
- `links[*].target_record_id` MUST ссылаться только на `record_id`.
- при `links rel=derived_from` target MUST совпадать с `source_event_id` (curator validation).
- `supersedes` и `links rel=supersedes` MUST быть взаимно-консистентны; schema проверяет наличие, а равенство target проверяется на этапе curator validation.
- для critical-mode при `oneOf` MUST использоваться `unevaluatedProperties: false` (draft 2019-09/2020-12); `additionalProperties: false` считать fallback для legacy-валидаторов.
- наличие `record_type` уже обеспечено глобальным `required`, поэтому дублировать `required: ["record_type"]` в каждой ветке не обязательно.

Минимальный шаблон `oneOf` для production:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "record_id": { "type": "string", "minLength": 1 },
    "record_type": { "enum": ["fact", "state", "identity", "competence"] },
    "natural_key": { "type": "string", "minLength": 1 },
    "subject": { "type": "string", "minLength": 1 },
    "predicate": { "type": "string", "minLength": 1 },
    "value": {},
    "supersedes": {
      "anyOf": [
        { "type": "null" },
        { "type": "string", "minLength": 1 }
      ]
    },
    "valid_time": {
      "type": "object",
      "properties": {
        "as_of": { "type": "string", "format": "date-time" }
      },
      "additionalProperties": false
    },
    "source_provenance": {
      "type": "object",
      "properties": {
        "source_kind": { "type": "string", "minLength": 1 },
        "source_id": { "type": "string", "minLength": 1 },
        "source_fingerprint": { "type": "string", "minLength": 1 },
        "observed_at": { "type": "string", "format": "date-time" },
        "extractor_version": { "type": "string", "minLength": 1 }
      },
      "required": ["source_kind", "source_id", "source_fingerprint", "observed_at", "extractor_version"],
      "additionalProperties": false
    },
    "evidence": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string",
        "anyOf": [
          { "type": "string", "pattern": "^rid:[A-Za-z0-9._:-]+$" },
          { "type": "string", "pattern": "^path:.+#.+" }
        ]
      }
    },
    "links": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "rel": {
            "enum": [
              "caused",
              "updated",
              "produced",
              "supersedes",
              "evidence_of",
              "derived_from",
              "influenced_by",
              "supports"
            ]
          },
          "target_record_id": { "type": "string", "minLength": 1 }
        },
        "required": ["rel", "target_record_id"],
        "additionalProperties": false
      }
    },
    "confidence": { "enum": [0.3, 0.6, 0.9] },
    "updated_at": { "type": "string", "format": "date-time" },
    "status": { "enum": ["active", "deprecated", "retracted"] }
  },
  "required": [
    "record_id",
    "record_type",
    "subject",
    "predicate",
    "value",
    "source_provenance",
    "evidence",
    "confidence",
    "updated_at",
    "status"
  ],
  "oneOf": [
    {
      "properties": {
        "record_type": { "const": "fact" },
        "natural_key": { "type": "string", "minLength": 1 }
      },
      "required": ["natural_key"]
    },
    {
      "properties": {
        "record_type": { "const": "state" },
        "natural_key": { "type": "string", "minLength": 1 },
        "source_event_id": { "type": "string", "minLength": 1 },
        "valid_time": {
          "type": "object",
          "properties": {
            "as_of": { "type": "string", "format": "date-time" }
          },
          "required": ["as_of"],
          "additionalProperties": false
        },
        "links": {
          "type": "array",
          "contains": {
            "type": "object",
            "properties": { "rel": { "const": "derived_from" } },
            "required": ["rel", "target_record_id"]
          }
        }
      },
      "required": ["natural_key", "source_event_id", "valid_time", "links"]
    },
    {
      "properties": {
        "record_type": { "const": "identity" },
        "natural_key": { "type": "string", "minLength": 1 },
        "valid_time": {
          "type": "object",
          "properties": {
            "as_of": { "type": "string", "format": "date-time" }
          },
          "required": ["as_of"],
          "additionalProperties": false
        }
      },
      "required": ["natural_key", "valid_time"]
    },
    {
      "properties": {
        "record_type": { "const": "competence" },
        "natural_key": { "type": "string", "minLength": 1 },
        "domain": { "type": "string", "minLength": 1 },
        "role": { "type": "string", "minLength": 1 },
        "scope": { "type": "string", "minLength": 1 }
      },
      "required": ["natural_key", "domain", "role", "scope"]
    }
  ],
  "allOf": [
    {
      "if": {
        "required": ["supersedes"],
        "properties": {
          "supersedes": { "type": "string", "minLength": 1 }
        }
      },
      "then": {
        "required": ["links"],
        "properties": {
          "links": {
            "contains": {
              "type": "object",
              "properties": { "rel": { "const": "supersedes" } },
              "required": ["rel", "target_record_id"]
            }
          }
        }
      }
    },
    {
      "if": {
        "required": ["links"],
        "properties": {
          "links": {
            "contains": {
              "type": "object",
              "properties": { "rel": { "const": "supersedes" } },
              "required": ["rel", "target_record_id"]
            }
          }
        }
      },
      "then": { "required": ["supersedes"] }
    }
  ],
  "unevaluatedProperties": false
}
```

#### `system/schemas/edge.schema.json`
Отвечает за валидацию производного edge-register (`meta/edges/*.jsonl`).

Минимально обязательные поля:
- `schema_version`,
- `apply_batch_id`,
- `src` (`record_id` источника, без префикса `rid:`),
- `rel` (`caused|updated|produced|supersedes|evidence_of|derived_from|influenced_by|supports`),
- `dst` (`record_id` цели, без префикса `rid:`),
- `as_of` (RFC3339 UTC),
- `evidence` (массив `record_id` без префикса `rid:`),
- `confidence`.

### 10.5 `meta/`

`meta/` — слой доказуемости и защиты от “тихого дрейфа” памяти.

#### `meta/manifests/`
Назначение: фиксация состояния канона после каждого успешного publish batch.

Требования:
- обязательный файл на каждый цикл консолидации,
- имя: `index_manifest_<UTC>.json`,
- manifest пишется только после полного успешного publish batch (`Apply + Views build + Edges build`) и является его финальным publish-marker.

#### `meta/manifests/index_manifest_20260305T101530Z.json`
Это снимок конкретной сборки индекса.

Обязательные поля:
- `manifest_id`,
- `build_time`,
- `source_commit`,
- `schema_version`,
- `record_counts`,
- `checksums`,
- `apply_batch_id`,
- `writer`.

Проверки при старте/деплое:
- commit parity,
- schema compatibility,
- checksum parity,
- `apply_batch_id` parity между `manifest` и runtime `applied ledger` (если runtime ledger импортирован в данный deployment).

Примечание:
`manifest` фиксирует состояние канона, но не является полным export-ом runtime frontier ingestion.

Checksum scope:
- `checksums` MUST покрывать только authoritative primary files канона:
  `user/L2_episodic/*`, `user/L3_semantic/*`, `user/L4_identity/*`, `user/L5_state/*`, `agents/*`, `system/*`;
- `checksums` MUST NOT включать производные артефакты `user/views/*`, `meta/edges/*`, `meta/manifests/*`
  и любые runtime caches.

#### `meta/edges/`
Назначение: производный реестр ребер для graph-export без сканирования всего markdown.

Требования:
- имя: `edges_<manifest_utc>.jsonl`,
- в v1 содержит полный актуальный snapshot активных canonical edges на момент соответствующего manifest,
- создается в том же publish batch, что и manifest, и публикуется до manifest-marker,
- каждая строка MUST содержать `schema_version` и `apply_batch_id`,
- `apply_batch_id` в каждой строке = batch, которым опубликован этот snapshot,
- `src/dst/evidence[]` используют единый формат `record_id` (без префикса `rid:`),
- `src` и `dst` MUST существовать в текущем каноничном snapshot (иначе fail-closed и edges не публикуется),
- не является source of truth, канонически пересобирается Curator-ом из `links[]`.

Формат строки JSONL (одно ребро):

```json
{"schema_version":"1.0","apply_batch_id":"20260305T101530Z","src":"uuid-event-1","rel":"caused","dst":"uuid-state-1","as_of":"2026-03-05T10:15:30Z","evidence":["uuid-event-1"],"confidence":0.9}
```

#### `meta/tombstones/`
Назначение: не дать удаленным/отозванным записям “воскреснуть”.

Режим v1:
- опционально для обычных доменов,
- обязательно для критичных доменов и retract/supersede сценариев.

#### `meta/tombstones/tombstone_pref_coffee_roast_20260305T081200Z.json`
Это запись деактивации конкретного знания.

Обязательные поля:
- `tombstone_id`,
- `target_record_id`,
- `reason_code`,
- `reason`,
- `decided_at`,
- `decided_by`,
- `superseded_by` (nullable),
- `evidence`.

Операционное правило:
- при наличии tombstone целевая запись не должна быть re-applied из старых snapshot/replay.

## 11) Варианты наполнения (без изменения архитектуры)

Для каждого файла применяются два режима:

- `MVP (быстрый запуск)`: только обязательные поля, короткие правила, один happy-path.
- `Production (безотказный)`: обязательные поля + коды ошибок + негативные сценарии + checklists валидации.

Рекомендуемый порядок наполнения:
1. `system/CANON.md` (инварианты и fail-closed поведение).
2. `system/schemas/*.json` (машинная валидация данных).
3. `system/policies/*.md` (процедуры curator, access, conflicts).
4. `meta/manifests/*` (доказуемость состояния).
5. `meta/edges/*` (graph-export слой, производный от канона).
6. `meta/tombstones/*` (защита от регрессий в критичных доменах).

## 12) Чеклист “работает как часы”

- `Apply` в v1 является crash-safe и manifest-gated: batch считается committed только после успешного `Manifest write`; глобальная multi-file atomicity на обычной FS не обещается, если deployment не реализует versioned snapshots / atomic pointer switch.
- `Edges build` выполняется после успешного `Apply + Views build` и до `Manifest write`.
- Manifest создается только после успешного полного `Apply + Views build + Edges build` и является финальным publish-marker batch-а.
- Нет записи в канон без валидного schema-check.
- Нет факта/state без `evidence`.
- Любая коррекция фиксируется новой записью (не silent overwrite).
- Конфликт не проходит “молча”: либо resolution, либо reject/defer с причиной.
- Для критичных retract/supersede создается tombstone.
- После каждого manifest существует синхронный `edges_<manifest_utc>.jsonl` с тем же `apply_batch_id`; это полный snapshot активных canonical edges, опубликованный в том же batch до manifest-marker.
- Повторная обработка runtime-источников контролируется через `source_watermark ledger`, а не через факт их удаления.
- После `Manifest write` выполняется отдельный `Source Ledger Commit`.
- Cleanup runtime-источников допускается только после успешного `Manifest write` и успешного `Source Ledger Commit`.
- `L2_episodic` является каноническим дневником жизни; human-readable day summary не используется как evidence без explicit event envelopes.

## 13) Дополнительный рабочий слой агентов (SQLite/FTS/vector/QMD/cache)

Этот раздел описывает **референсный OpenClaw adapter profile** для ускорения retrieval.
Он является implementation-specific и non-normative по отношению к канону.

Изменения в backend-слое (`SQLite`, `QMD`, `vector`, `graph backend`, caches, watcher strategy, config keys)
не меняют memory-canon, пока сохраняются инварианты разделов 1–12:
- source of truth = `workspace/memory/core/*`;
- runtime indexes = производные ускорители;
- canon остается переносимым вне конкретного AI runtime.

Этот слой находится **вне `workspace/memory/*`** и нужен только для быстрого retrieval.
Архитектура канона не меняется:
- source of truth остается в `workspace/memory/core/*`;
- индексный слой — производный runtime-механизм поиска.
- graph backend (Neo4j/TerminusDB/TypeDB) — такой же runtime index, читающий `meta/edges/*`.

### 13.1 Границы слоя (обязательные)

- Расположение: runtime state (`~/.openclaw/*`), не в memory-canon, не коммитится в git.
- Назначение: ускоренный поиск и ранжирование, а не хранение истины.
- Доступ: может читать только те каноничные markdown-источники и session-транскрипты (если включено), которые разрешены `access-profile` / `retrieval-profile`; писать в канон не может.
- Отказоустойчивость: при падении отдельного backend-а поиск деградирует (fallback), а не ломает весь pipeline консолидации.

### 13.2 Что именно хранится вне memory

- `~/.openclaw/memory/<agentId>.sqlite`:
  per-agent индекс builtin memory backend (chunks, метаданные, embeddings/cache).
- `~/.openclaw/memory/applied_ledger.sqlite` (или `~/.openclaw/memory/curator/applied_ledger.jsonl`):
  runtime ledger примененных `apply_batch_id`; не часть канона, не коммитится в git.
- `~/.openclaw/memory/curator/source_ledger.sqlite` (или `~/.openclaw/memory/curator/source_ledger.jsonl`):
  runtime ledger обработанных runtime-источников и spans; не часть канона, не коммитится в git.
- `~/.openclaw/agents/<agentId>/qmd/`:
  runtime-дом QMD backend (config/cache/sqlite sidecar).
- `~/.openclaw/agents/<agentId>/qmd/sessions/`:
  экспорт sanitized session transcripts для QMD (если включено).
- `~/.openclaw/agents/<agentId>/sessions/*.jsonl`:
  исходные session transcripts (используются как источник наблюдений/поиска по сессиям).

### 13.3 Builtin SQLite + FTS5 + vector (рабочий профиль по умолчанию)

- Дефолтный backend: SQLite index manager.
- Тип данных для индекса: Markdown chunks.
- Базовый гибридный поиск:
  - vector similarity (семантика),
  - BM25 через FTS5 (точные токены/идентификаторы).
- Reranking: включен MMR для снижения near-duplicates в выдаче.
- Recency: включен temporal decay / freshness boost для приоритета более актуальных chunk-ов.
- При отсутствии FTS5 система продолжает работать в vector-only режиме.
- При недоступных embeddings система может вернуть keyword/BM25 матчинг (если доступен).

### 13.4 Vector-ускорение и fallback

- При наличии `sqlite-vec` embeddings хранятся в SQLite vector table и ищутся в БД (быстрее, меньше нагрузки на JS-процесс).
- Если `sqlite-vec` не загрузился, backend не падает: используется fallback на in-process cosine search.
- Смена embedding provider/model/endpoint fingerprint/chunk params должна триггерить полный reindex.

### 13.5 QMD backend (опциональный sidecar)

- Включение: `memory.backend = "qmd"`.
- QMD работает как локальный sidecar retrieval engine (BM25 + vectors + rerank).
- Индекс обновляется через `qmd update` + `qmd embed` на boot и по интервалу (`memory.qmd.update.interval`, дефолт 5m).
- Boot refresh по умолчанию неблокирующий; для строгой синхронизации можно включить `waitForBootSync`.
- Если QMD недоступен/сломался, поиск автоматически откатывается на builtin SQLite backend.

### 13.6 Кэширование и свежесть данных

- Embedding cache в SQLite:
  снижает стоимость/время переиндексации и повторных обновлений неизмененных chunk-ов.
- Для cache обязателен лимит `maxEntries` (подбирается по объему воркспейса и контролируется по eviction-rate).
- Файловый watcher помечает индекс dirty при изменениях memory-файлов (debounce).
- Sync выполняется асинхронно (на старте, по поиску, по интервалу); `memory_search` не должен блокироваться на индексации.
- Для session-поиска применяются delta-threshold trigger-ы; возможна короткая “eventual consistency” задержка.
- `experimental.sessionMemory` (если включено) ограничивается curator/orchestrator профилями и источниками `["memory","sessions"]`.

### 13.7 Интеграция с текущей канонической архитектурой

Интеграция делается без новых слоев истины:
1. Curator публикует batch в порядке `Apply -> Views -> Edges -> Manifest` (см. шаги 4-8 в разделе 8).
2. После финального `Manifest write` index-layer получает сигнал `dirty` и запускает background sync/reindex.
3. Каждый индексный snapshot MUST быть привязан к одному `manifest_id` / `apply_batch_id`; смешивать результаты из разных manifest в одном authoritative recall нельзя.
4. Агентский retrieval читает только индекс/кэш; изменения в канон вносит только Curator.
5. Любой ответ, полученный через retrieval, при переносе в канон должен иметь `evidence` на исходные каноничные записи.

Обязательный принцип:
- индекс может ускорять recall, но не может “узаконить” факт без curator-валидации.

### 13.8 Подключение каноничных путей в индекс

По умолчанию OpenClaw индексирует свой стандартный memory-layout.
Для нашей структуры (`workspace/memory/core/*`) каноничные markdown-пути подключаются
не глобально, а через allowlist профиля агента:
- для builtin backend — через `agents.defaults.memorySearch.extraPaths`,
- для QMD backend — через `memory.qmd.paths` (и/или `includeDefaultMemory` при необходимости).

Требование:
- allowlist путей определяется `access-profile` / `retrieval-profile` конкретного агента;
- в индекс включаются только первичные markdown-источники канона, разрешенные профилем;
- `workspace/memory/core/user/views/*` не индексируется;
- `workspace/memory/core/user/*` не подключается рядовым агентам без явной необходимости;
- изменение allowlist, redaction-policy или data-classification для индексируемых путей MUST триггерить пересборку затронутого индекса,
- индексирование не должно подмешивать неканоничные временные файлы в authoritative recall для curator.

Профили подключения:
- `default role-agent profile`:
  - `workspace/memory/core/agents/<role>/**/*.md`
- `main/orchestrator profile`:
  - разрешенные срезы `workspace/memory/core/user/L2_episodic/**/*.md`
  - разрешенные срезы `workspace/memory/core/user/L3_semantic/*.md`
  - разрешенные срезы `workspace/memory/core/user/L4_identity/*.md`
  - разрешенные срезы `workspace/memory/core/user/L5_state/*.md`
  - нужные role canons `workspace/memory/core/agents/<role>/**/*.md`
- `curator profile`:
  - весь первичный canon (`workspace/memory/core/user/L2_episodic/**/*.md`, `workspace/memory/core/user/L3_semantic/*.md`, `workspace/memory/core/user/L4_identity/*.md`, `workspace/memory/core/user/L5_state/*.md`, `workspace/memory/core/agents/**/*.md`)
  - опционально `workspace/memory/core/system/**/*.md`

### 13.9 Минимальный операционный профиль “безотказно”

- `cache.enabled = true` (embedding cache включен).
- Hybrid retrieval включен (FTS + vector), но с допустимой деградацией до vector-only.
- `agents.defaults.compaction.memoryFlush.enabled = true` (silent flush перед compaction).
- QMD используется опционально; fallback на builtin backend обязателен.
- После каждого успешного manifest проверяется `index freshness`.
- При несоответствии fingerprint/provider/model/chunking выполняется full reindex.
- Heartbeat-диагностика по расписанию: `openclaw memory status --deep --index` с алертом при dirty/error состоянии.
- Все runtime индексы и кэши живут вне `workspace/memory/*` и не считаются частью канона.
