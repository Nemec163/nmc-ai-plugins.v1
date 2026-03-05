# Memory Design v1 (Final)

## 1) Цель
Построить долговременную память, которая:
- не смешивает runtime и канон;
- масштабируется на 100+ агентов;
- переживает клоны/миграции/переиндексации без потери трассируемости;
- остается практичной в ежедневной эксплуатации.

## 2) Привязка к OpenClaw Workspace
- Базовая единица `L0` в мультиагентном режиме: `workspace/<agent>/`.
- Внутри каждого `workspace/<agent>/` лежат агентские runtime/bootstrap файлы (`AGENTS.md`, `SOUL.md`, `USER.md`, `IDENTITY.md`, `TOOLS.md`, `BOOT.md`, `memory/*`).
- Общая долговременная память хранится в едином корне `workspace/memory/`:
  - `workspace/memory/intake/*`
  - `workspace/memory/core/*`
- `~/.openclaw/*` (config, credentials, sessions, managed skills) не является частью memory-canon и не коммитится в этот репозиторий.

## 3) Нормативные принципы
- `L0` всегда эфемерный runtime-контекст, не source of truth (`workspace/<agent>/`).
- `L1` хранит сырьевые claims до кураторского решения.
- Канон хранится в `workspace/memory/core/*` и обновляется только через curator-пайплайн.
- Intake хранится в `workspace/memory/intake/*`.
- `user/*` — единственное место для личных слоев `L2/L3/L4/L5`.
- `agents/*` — только competence canon роли (знания, паттерны, anti-mistakes), без role-local state слоев.
- В `agents/<role>/` каноничны файлы `COURSE.md`, `PLAYBOOK.md`, `PITFALLS.md`, `DECISIONS.md` (без дополнительных внутренних слоев).
- Все каноничные записи имеют единый мета-контракт (`record_id`, `evidence`, `updated_at`, и т.д.).
- `user/views/*` — это view-слой, а не первичный источник истины.

### Read-only канон

`workspace/memory/core/*` является канонической долговременной памятью системы.

Все агенты могут **читать** эту память для получения контекста,
но **ни один агент не имеет права записывать в неё напрямую**.

Единственный writer канона — **Memory Curator**.

---

### Политика одного писателя (Single Writer Policy)

Каноническая память обновляется **только одним агентом — Memory Curator**
через curator pipeline.

Другие агенты **никогда не записывают напрямую** в `workspace/memory/core/*`.

---

### Модель ночной консолидации

Каноническая память обновляется **периодическими циклами консолидации**
(обычно **1 раз в сутки**, например в 00:00).

В течение дня канон остаётся неизменным.

---

### Правило дневной дельты

Все события, наблюдения, решения и изменения, происходящие в течение дня,
существуют **только в runtime памяти агентов (L0)**
до момента ночной консолидации.

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
  trader/                              # L0 для агента trader (пример)
    AGENTS.md
    SOUL.md
    USER.md
    IDENTITY.md
    TOOLS.md
    BOOT.md
    memory/
      2026-03-05.md
  designer/                            # L0 для агента designer (пример)
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
          claim_000123.json
          claim_000124.json
      queue/                           # статусы обработки intake
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
        L2_episodic/                   # append-only события
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
natural_key: "state:user.current_location" # MUST for state/identity in v1, stable semantic key
valid_time:                                # MUST for state/identity in v1
  as_of: "2026-03-05T10:15:30Z"
source_ref:
  - "workspace/memory/intake/L1/2026-03-05/claim_000123.json"
evidence:
  - "rid:uuid-event-1"
  - "path:workspace/memory/core/user/L2_episodic/2026/03/05.md#event_uuid-event-1"
links:                                     # optional in v1, typed outgoing edges by record_id
  - rel: "caused" # enum: caused|updated|produced|supersedes|evidence_of|derived_from|influenced_by|supports
    target_record_id: "uuid-state-change-1"
confidence: 0.6
supersedes: null
status: "event=active|corrected|retracted; fact|state|identity|competence=active|deprecated|retracted"
```

Примечания:
- `record_id`, `source_ref`, `evidence`, `updated_at`, `supersedes` — обязательный минимум.
- `natural_key` MUST для `state|identity` уже в v1 (для `fact|competence` пока optional).
- `natural_key` MUST быть нормализован: lowercase, разделители только `:` и `.`, без пробелов; минимум `record_type + domain + slot` (например `state:user.current_location`).
- `valid_time.as_of` MUST для `state|identity` уже в v1.
- `evidence[*]` поддерживает два формата: `rid:<record_id>` (канонический) и `path:<path>#<anchor>` (человеко-удобный).
- `created_by` — опциональное (рекомендуемое) поле для фиксации curator pipeline, создавшего запись.
- `created_by` упрощает аудит и воспроизводимость генерации памяти.
- `confidence` обязателен и назначается только curator pipeline по дискретной шкале `0.3 | 0.6 | 0.9` (`low | medium | high`).
- `status` нормируется по `record_type`: `event -> active|corrected|retracted`; `fact|state|identity|competence -> active|deprecated|retracted`.
- `links[*].rel` в v1 фиксируется enum-ом: `caused | updated | produced | supersedes | evidence_of | derived_from | influenced_by | supports`.
- `links[*].target_record_id` всегда указывает на `record_id` (path/anchor в ссылке опциональны и остаются человеко-читаемым удобством).
- `supersedes` и `links rel=supersedes` синхронизируются двусторонне: если задано одно, MUST быть задано второе на тот же `record_id`.
- future-proof: `target_record_id` может ссылаться как на "узел-запись", так и на отдельную relation-entity запись (`record_type=relation`, если будет введен позже).
- `L2_episodic` остается append-only: исправления добавляются отдельной `correction_*` записью в дневном файле (или на следующий день).

## 7) Правила по слоям
- `L0`: это `workspace/<agent>/` (runtime/bootstrap/локальные логи агента), не канон.
- `L1`: `workspace/memory/intake/*` + очередь статусов `new -> normalized -> curated/rejected -> applied`.
- `user/L2`: `workspace/memory/core/user/L2_episodic/YYYY/MM/DD.md` (append-only дневные файлы); каждое событие MUST иметь явный `record_id` и детерминированный markdown anchor вида `#event_<record_id>`.
- `user/L3`: `workspace/memory/core/user/L3_semantic/*.md` по доменам (`preferences.md`, `skills.md`, и т.д.) с типовыми блоками записей.
- `user/L4`: `workspace/memory/core/user/L4_identity/{current.md,update_log.md}`.
- `user/L5`: `workspace/memory/core/user/L5_state/current.md`; `record_type=state` MUST иметь `source_event_id` и быть только проекцией `L2`; markdown-сводки генерируются как views.
- для `record_type=state` canonical links: `derived_from -> source_event_id`, а при версии-замене добавляется `supersedes -> previous_state_record_id`.
- для записей версионирования `supersedes` и `links rel=supersedes` MUST оставаться консистентными (без расхождения).
- `agents/*`: `workspace/memory/core/agents/*` хранит только роль-специфичную компетенцию и anti-mistakes в `COURSE.md`, `PLAYBOOK.md`, `PITFALLS.md`, `DECISIONS.md`.
- `agents/*/history`: опционально, создается только при явной необходимости.

### Runtime Recall Rule

Во время работы агенты формируют рабочий контекст следующим образом:

```text
L0 runtime context
+ snapshot канонической памяти (L2/L3/L4/L5)
+ role competence (agents/<role>/)
```

Каноническая память представляет собой **последний подтверждённый снимок системы**,
полученный после последнего цикла консолидации.

События текущего дня остаются в **runtime памяти (L0)**
до следующей ночной консолидации.

## 8) Пайплайн консолидации
0. `Nightly Snapshot (L0 → L1)`: Memory Curator запускается по расписанию (обычно **один раз в сутки**, например **00:00**) и проходит по **всем агентам системы**, извлекая наблюдения из **OpenClaw session history**.

Источником данных являются **transcripts завершённых сессий агентов**.

Пример источника:

```text
sessions/YYYY-MM-DD-<session>.jsonl
```

или другой формат session transcripts, используемый текущей версией OpenClaw.

### Правила extraction

Memory Curator:
1. Получает список **новых или обновлённых сессий**.
2. Для каждой сессии выполняет extraction.
3. Разбивает transcript на **атомарные claims**.

Каждая сессия обрабатывается как **отдельная extraction-сессия**.

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

### Важное правило

Session transcripts являются **источником наблюдений (observations)**,
но **не являются канонической памятью**.

Они используются **только для извлечения фактов и событий**,
которые затем проходят curator pipeline.

1. `Collect`: claim попадает в `workspace/memory/intake/L1/*` и `workspace/memory/intake/queue/new`.
2. `Normalize`: нормализация + перенос в `workspace/memory/intake/queue/normalized`.
3. `Curate`: решение `curated` или `rejected`.
4. `Apply`:
   - выполняется **отдельной сессией после завершения Nightly Snapshot**;
   - Memory Curator обрабатывает curated claims, создаёт записи в `L2` и обновляет `L3/L4/L5`;
   - логика `Apply` не меняется, добавляется только уточнение последовательности;
   - append в `workspace/memory/core/user/L2_episodic/YYYY/MM/DD.md` (если это событие),
   - upsert в `workspace/memory/core/user/L3_semantic/*.md` (если это устойчивый факт),
   - update `workspace/memory/core/user/L4_identity/current.md` и `update_log.md` (при достаточном evidence),
   - update `workspace/memory/core/user/L5_state/current.md` (только как проекция событий).
5. `Role course update`: обновление `workspace/memory/core/agents/*/{COURSE,PLAYBOOK,PITFALLS,DECISIONS}.md` по итогам курации.
6. `Views build`: генерация `workspace/memory/core/user/views/*`.
7. `Manifest write`: запись нового `workspace/memory/core/meta/manifests/*`.
8. `Edges build`: генерация `workspace/memory/core/meta/edges/edges_<manifest_utc>.jsonl` строго из каноничных `record_id/links` текущего `apply_batch_id`; при dangling `src/dst` (`record_id` отсутствует в текущем снимке) этап MUST fail-closed.

## 9) Режим миграций (практичный)
Базовый сценарий допускается:
- `git clone`
- `reindex --full`

Но прод-валидность подтверждается только при наличии актуального `manifest`:
- commit совпадает;
- counts/checksums совпадают;
- schema_version совместима.

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
- `Layer Invariants`: append-only для L2, projection-only для L5, evidence-first для L3/L4.
- `Record Contract`: обязательные поля (`record_id`, `updated_at`, `evidence`, `status`) + graph-ready поля (`natural_key`, `valid_time`, `links`).
- `Natural Key Contract`: `natural_key` нормализован (`<record_type>:<domain>.<slot>`, lowercase, без пробелов) и стабилен между apply-циклами.
- `Relation Truth`: source of truth по связям — только `links[]` в записях; `meta/edges/*` — производный экспорт/кэш.
- `Consolidation Contract`: последовательность `Collect -> Normalize -> Curate -> Apply -> Manifest -> Edges`.
- `Failure Contract`: что делать при ошибке (не писать частично, не обновлять manifest при неполном Apply).

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
- идемпотентность (`apply_batch_id`, запрет повторного применения одного и того же claim batch),
- двухфазный Apply (MUST): `Phase 1 (staging)` — собрать все новые файлы/патчи и пройти schema-validation; `Phase 2 (commit switch)` — выполнить атомарный rename/snapshot switch; при ошибке validation — fail-closed и очистка staging,
- `apply_batch_id` фиксируется одновременно в `manifest` и runtime `applied ledger` (file/sqlite) в runtime-path (например `~/.openclaw/memory/applied_ledger.sqlite` или `~/.openclaw/memory/curator/applied_ledger.jsonl`), строго вне `workspace/memory/*` и вне git, для детерминированного recovery после crash (`replay-safe` или `already-applied skip`),
- порядок обработки (детерминированный, стабильная сортировка по времени + id),
- обязательный `full reindex` при смене fingerprint (`provider/model/endpoint/chunking`) без частичных “догрузок”,
- `views/*` не используется как evidence для `L3/L4/L5` (только навигация/чтение),
- после успешного `Manifest write` MUST выполняться `Edges build` (без пропусков),
- `meta/edges/*` MUST быть синхронизирован с тем же `apply_batch_id`, что и соответствующий manifest,
- `Edges build` MUST проваливаться (fail-closed), если любой `src/dst` не существует в каноничном snapshot текущего Apply,
- для `record_type=state` ссылка `derived_from` MUST указывать на тот же `record_id`, что и `source_event_id` (проверка на шаге curator validation),
- при наличии `supersedes` значение MUST совпадать с `links[].target_record_id` для `rel=supersedes` (проверка на шаге curator validation),
- внешние graph backends (Neo4j/TerminusDB/TypeDB и т.д.) трактуются как runtime index; source of truth остается в markdown/json каноне.

#### `system/policies/access.md`
Отвечает за модель прав и запретов.

Фиксировать:
- матрицу `actor x path x action`,
- явный deny на запись в `core/*` для всех кроме Memory Curator,
- режим аудита (кто и когда читал/писал критичные файлы),
- техническое enforcement на FS-уровне: `core/*` в read-only через POSIX perms/ACL для всех кроме curator-service account,
- отдельное правило для `views/*`: read-only, non-authoritative, без права быть источником `evidence`.

#### `system/policies/retention.md`
Отвечает за сроки хранения и архив.

Фиксировать:
- TTL для intake (`L1`, queue),
- бессрочность или регламент для канона,
- правила архивации и восстановления,
- запрет физического удаления канона без tombstone/аудита (для критичных доменов).

#### `system/policies/redaction.md`
Отвечает за обработку чувствительных данных.

Фиксировать:
- классы данных (`public`, `internal`, `sensitive`, `restricted`),
- правила редактирования (`mask/hash/remove/tokenize`),
- момент применения редактирования (до попадания в L2/L3/L4/L5),
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
- `evidence` (непустой массив ссылок),
- `confidence` (`MVP: 0..1; Production: enum 0.3|0.6|0.9`),
- `status` (`active|corrected|retracted`),
- `updated_at`.

Рекомендации надежности:
- `natural_key` как стабильный semantic key (опционально в v1, MUST позже),
- `links[]` с `target_record_id` для явной причинности/event-graph,
- `evidence[*]` в формате `rid:<record_id>` (предпочтительно) или `path:<path>#<anchor>` для человеко-читаемой навигации,
- `additionalProperties: false` для критичных объектов,
- строгие `enum` и `format`,
- явные правила для `correction_of`/`supersedes`,
- в markdown-представлении L2 каждое событие MUST иметь anchor `#event_<record_id>` (детерминированный, не зависящий от форматирования файла).

#### `system/schemas/fact.schema.json`
Отвечает за валидацию фактов/состояний (L3/L5).

Минимально обязательные поля:
- `record_id`,
- `record_type=fact|state|identity|competence` (по выбранной модели),
- `natural_key` (MUST для `state|identity`, optional для `fact|competence` в v1),
- `subject`,
- `predicate`,
- `value`,
- `evidence`,
- `links` (опционально в v1, но для `record_type=state` MUST содержать минимум `rel=derived_from`),
- `confidence` (`MVP: 0..1; Production: enum 0.3|0.6|0.9`),
- `updated_at`,
- `status` (`active|deprecated|retracted`).

Production-контракт (strict, fail-closed):
- `oneOf` MUST разделять ветки по `record_type`, чтобы схема отбрасывала кривые формы до Apply.
- общие поля MUST быть объявлены в верхнеуровневом `properties`, чтобы при `unevaluatedProperties: false` валидатор не рубил корректные записи как “не evaluated”.
- `record_type=state` MUST требовать `source_event_id` (L5 всегда проекция из L2).
- `record_type=state` MUST иметь `natural_key`, `valid_time.as_of` и в schema требовать `links contains rel=derived_from`; равенство `links[].target_record_id == source_event_id` проверяется на этапе curator validation.
- `record_type=identity` MUST требовать `natural_key` и `valid_time.as_of` в формате RFC3339 UTC.
- `record_type=competence` MUST требовать `domain`, `role`, `scope`.
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
    "evidence",
    "confidence",
    "updated_at",
    "status"
  ],
  "oneOf": [
    {
      "properties": { "record_type": { "const": "fact" } }
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
        "domain": { "type": "string", "minLength": 1 },
        "role": { "type": "string", "minLength": 1 },
        "scope": { "type": "string", "minLength": 1 }
      },
      "required": ["domain", "role", "scope"]
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
Назначение: фиксация состояния канона после каждого успешного Apply.

Требования:
- обязательный файл на каждый цикл консолидации,
- имя: `index_manifest_<UTC>.json`,
- manifest пишется только после полного успешного Apply.

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
- `apply_batch_id` parity между `manifest` и runtime `applied ledger`.

#### `meta/edges/`
Назначение: производный реестр ребер для graph-export без сканирования всего markdown.

Требования:
- имя: `edges_<manifest_utc>.jsonl`,
- создается только после успешного `Manifest write`,
- содержит только ребра текущего `apply_batch_id`,
- каждая строка MUST содержать `schema_version` и `apply_batch_id`,
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

- Любой Apply атомарен: staging + atomic rename/commit-switch, чтобы либо все целевые файлы обновились, либо ни один.
- Manifest создается только после успешного полного Apply.
- Нет записи в канон без валидного schema-check.
- Нет факта/state без `evidence`.
- Любая коррекция фиксируется новой записью (не silent overwrite).
- Конфликт не проходит “молча”: либо resolution, либо reject/defer с причиной.
- Для критичных retract/supersede создается tombstone.
- После каждого manifest существует синхронный `edges_<manifest_utc>.jsonl` с тем же `apply_batch_id`.

## 13) Дополнительный рабочий слой агентов (SQLite/FTS/vector/QMD/cache)

Этот слой находится **вне `workspace/memory/*`** и нужен только для быстрого retrieval.
Архитектура канона не меняется:
- source of truth остается в `workspace/memory/core/*`;
- индексный слой — производный runtime-механизм поиска.
- graph backend (Neo4j/TerminusDB/TypeDB) — такой же runtime index, читающий `meta/edges/*`.

### 13.1 Границы слоя (обязательные)

- Расположение: runtime state (`~/.openclaw/*`), не в memory-canon, не коммитится в git.
- Назначение: ускоренный поиск и ранжирование, а не хранение истины.
- Доступ: может читать каноничные markdown-источники и session-транскрипты (если включено), но не писать в канон.
- Отказоустойчивость: при падении отдельного backend-а поиск деградирует (fallback), а не ломает весь pipeline консолидации.

### 13.2 Что именно хранится вне memory

- `~/.openclaw/memory/<agentId>.sqlite`:
  per-agent индекс builtin memory backend (chunks, метаданные, embeddings/cache).
- `~/.openclaw/memory/applied_ledger.sqlite` (или `~/.openclaw/memory/curator/applied_ledger.jsonl`):
  runtime ledger примененных `apply_batch_id`; не часть канона, не коммитится в git.
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
1. Curator завершает `Apply`, пишет manifest и затем edges-файл (см. шаги 7-8 в разделе 8).
2. После `manifest + edges` index-layer получает сигнал `dirty` и запускает background sync/reindex.
3. Агентский retrieval читает только индекс/кэш; изменения в канон вносит только Curator.
4. Любой ответ, полученный через retrieval, при переносе в канон должен иметь `evidence` на исходные каноничные записи.

Обязательный принцип:
- индекс может ускорять recall, но не может “узаконить” факт без curator-валидации.

### 13.8 Подключение каноничных путей в индекс

По умолчанию OpenClaw индексирует свой стандартный memory-layout.
Для нашей структуры (`workspace/memory/core/*`) обязательно явно подключать каноничные markdown-пути:
- для builtin backend — через `agents.defaults.memorySearch.extraPaths`,
- для QMD backend — через `memory.qmd.paths` (и/или `includeDefaultMemory` при необходимости).

Требование:
- в индекс включаются только первичные markdown-источники канона (`L2/L3/L4/L5` + role canon);
- `workspace/memory/core/user/views/*` не индексируется;
- индексирование не должно подмешивать неканоничные временные файлы в authoritative recall для curator.

Минимальный набор `extraPaths` для всех рабочих агентов:
- `workspace/memory/core/user/L2_episodic/**/*.md`
- `workspace/memory/core/user/L3_semantic/*.md`
- `workspace/memory/core/user/L4_identity/*.md`
- `workspace/memory/core/user/L5_state/*.md`
- `workspace/memory/core/agents/**/*.md`

Ограниченный набор для curator/orchestrator:
- опционально `workspace/memory/core/system/**/*.md` (рядовым агентам не подключать, чтобы не засорять recall).

### 13.9 Минимальный операционный профиль “безотказно”

- `cache.enabled = true` (embedding cache включен).
- Hybrid retrieval включен (FTS + vector), но с допустимой деградацией до vector-only.
- `agents.defaults.compaction.memoryFlush.enabled = true` (silent flush перед compaction).
- QMD используется опционально; fallback на builtin backend обязателен.
- После каждого успешного manifest проверяется `index freshness`.
- При несоответствии fingerprint/provider/model/chunking выполняется full reindex.
- Heartbeat-диагностика по расписанию: `openclaw memory status --deep --index` с алертом при dirty/error состоянии.
- Все runtime индексы и кэши живут вне `workspace/memory/*` и не считаются частью канона.
