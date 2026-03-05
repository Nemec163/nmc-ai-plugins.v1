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

      meta/
        manifests/                     # обязательно
          index_manifest_20260305T101530Z.json
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

## 6) Контракт каноничной записи (обязательные поля)
Для любых каноничных записей в `workspace/memory/core/agents/*/{COURSE,PLAYBOOK,PITFALLS,DECISIONS}.md` и в `workspace/memory/core/user/L3_semantic/*`, `workspace/memory/core/user/L4_identity/*`, `workspace/memory/core/user/L5_state/*`:

```yaml
record_id: "uuid-or-stable-id"
record_type: "event|fact|competence|identity|state"
schema_version: "1.0"
created_at: "2026-03-05T10:15:30Z"
updated_at: "2026-03-05T10:15:30Z"
created_by: "memory-curator@v1" # optional
source_ref:
  - "workspace/memory/intake/L1/2026-03-05/claim_000123.json"
evidence:
  - "workspace/memory/core/user/L2_episodic/2026/03/05.md#event_20260305T091500Z_meeting_preference"
confidence: 0.0
supersedes: null
status: "active|deprecated|retracted"
```

Примечания:
- `record_id`, `source_ref`, `evidence`, `updated_at`, `supersedes` — обязательный минимум.
- `created_by` — опциональное (рекомендуемое) поле для фиксации curator pipeline, создавшего запись.
- `created_by` упрощает аудит и воспроизводимость генерации памяти.
- `L2_episodic` остается append-only: исправления добавляются отдельной `correction_*` записью в дневном файле (или на следующий день).

## 7) Правила по слоям
- `L0`: это `workspace/<agent>/` (runtime/bootstrap/локальные логи агента), не канон.
- `L1`: `workspace/memory/intake/*` + очередь статусов `new -> normalized -> curated/rejected -> applied`.
- `user/L2`: `workspace/memory/core/user/L2_episodic/YYYY/MM/DD.md` (append-only дневные файлы).
- `user/L3`: `workspace/memory/core/user/L3_semantic/*.md` по доменам (`preferences.md`, `skills.md`, и т.д.) с типовыми блоками записей.
- `user/L4`: `workspace/memory/core/user/L4_identity/{current.md,update_log.md}`.
- `user/L5`: `workspace/memory/core/user/L5_state/current.md`; markdown-сводки генерируются как views.
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
meta/
  manifests/
    index_manifest_20260305T101530Z.json
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
- `Record Contract`: обязательные поля (`record_id`, `updated_at`, `evidence`, `status`).
- `Consolidation Contract`: последовательность `Collect -> Normalize -> Curate -> Apply -> Manifest`.
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
- идемпотентность (`apply_id`, запрет повторного применения одного и того же claim batch),
- порядок обработки (детерминированный, стабильная сортировка по времени + id).

#### `system/policies/access.md`
Отвечает за модель прав и запретов.

Фиксировать:
- матрицу `actor x path x action`,
- явный deny на запись в `core/*` для всех кроме Memory Curator,
- режим аудита (кто и когда читал/писал критичные файлы).

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
- `confidence` (`0..1`),
- `status` (`active|corrected|retracted`),
- `updated_at`.

Рекомендации надежности:
- `additionalProperties: false` для критичных объектов,
- строгие `enum` и `format`,
- явные правила для `correction_of`/`supersedes`.

#### `system/schemas/fact.schema.json`
Отвечает за валидацию фактов/состояний (L3/L5).

Минимально обязательные поля:
- `record_id`,
- `record_type=fact|state|identity|competence` (по выбранной модели),
- `subject`,
- `predicate`,
- `value`,
- `evidence`,
- `confidence`,
- `updated_at`,
- `status`.

Рекомендации надежности:
- поддержка `valid_from/valid_to` для временных фактов,
- обязательный `source_event_id` для state-проекций,
- запрет пустых `evidence`.

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
- checksum parity.

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
5. `meta/tombstones/*` (защита от регрессий в критичных доменах).

## 12) Чеклист “работает как часы”

- Любой Apply атомарен: либо все целевые файлы обновлены, либо ни один.
- Manifest создается только после успешного полного Apply.
- Нет записи в канон без валидного schema-check.
- Нет факта/state без `evidence`.
- Любая коррекция фиксируется новой записью (не silent overwrite).
- Конфликт не проходит “молча”: либо resolution, либо reject/defer с причиной.
- Для критичных retract/supersede создается tombstone.
