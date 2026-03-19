# MemoryOS.v1 — Guideline по фазам доработки

> Статус: doc-driven guideline
> Основание: оценка по документации без аудита исходников
> Дата: 2026-03-19
> Назначение: превратить сильную canonical/governance-first архитектуру в более практично превосходящий memory product, не ломая базовые инварианты MemoryOS.v1

## 1. Как читать этот документ

Этот guideline не заменяет действующий roadmap и не утверждает, что все пункты уже подтверждены по коду. Он фиксирует рекомендуемую последовательность архитектурных доработок на основе текущей документации и внешней сравнительной оценки.

Логика документа такая:

- не ослаблять `canon`, а наращивать производные слои вокруг него
- не смешивать authoritative memory и runtime convenience
- усиливать retrieval, DX и connector surface без потери auditability
- идти фазами, где каждая фаза даёт отдельный архитектурный выигрыш

## 2. Неподвижные инварианты

Все фазы ниже предполагают сохранение этих правил:

- `canon` остаётся единственным authoritative layer
- запись в `canon` идёт только через один promotion path
- `runtime/shadow` остаётся неавторитетным и перестраиваемым
- любой read index, cache, graph view или profile bundle является производным слоем
- verify должен уметь доказать происхождение, целостность и rebuild semantics
- git и файловый canon остаются source of truth

## 3. Приоритетный вектор

Если цель сформулировать коротко, то вектор такой:

1. сначала закрыть connector contract gap
2. затем поднять read-path до уровня write-path
3. потом формализовать procedural memory и namespace model
4. после этого ужесточить verify semantics и упростить product boundary

---

## Фаза 1. Claude connector как bounded contract

### Цель

Закрыть текущий самый явный архитектурный долг: `adapter-claude` должен перестать быть scaffold-only пакетом и стать поддерживаемым коннектором поверх существующих gateway и handoff surfaces.

### Что делать

- определить минимальный поддерживаемый runtime contract для Claude
- ограничить scope адаптера: bootstrap, role bundle intake, read-only canon access, proposal upload, feedback/completion handoff
- не давать адаптеру прямой write path в canon
- включить `adapter-claude` в conformance suite на тех же capability-scoped правилах, что и остальные адаптеры
- явно задокументировать, что Claude adapter умеет, а что пока не обещает

### Артефакты фазы

- контракт возможностей `adapter-claude`
- fixture-backed conformance coverage
- обновлённая архитектурная документация по connector matrix

### Критерий готовности

Claude adapter можно описать как bounded supported connector, а не как заготовку.

### Почему это первая фаза

Это выравнивает product story: MemoryOS перестаёт выглядеть как архитектура с одним production connector и одним недостроенным обещанием.

---

## Фаза 2. Derived read index поверх canon

### Цель

Устранить главный дисбаланс системы: write/governance уже сильные, а read-path по документации пока слабее и менее масштабируем.

### Что делать

- ввести отдельный derived read layer, который rebuildится из canon
- хранить в этом слое нормализованные документы, чанки, metadata filters, link graph projection и search keys
- поддержать минимум три режима чтения:
  - точный lookup по `record_id` и структурным полям
  - lexical/full-text search
  - semantic or hybrid retrieval
- формализовать rebuild model: full rebuild, selective rebuild, stale index detection
- встроить read index в gateway как производную capability, а не как вторую truth layer

### Предпочтительные свойства реализации

- index rebuildable from canon only
- index disposable without data loss
- query latency and ranking quality measurable independently from canon integrity

### Артефакты фазы

- пакет или подпакет индексатора
- gateway read API для hybrid retrieval
- операционные команды `build-index`, `verify-index`, `rebuild-index`

### Критерий готовности

MemoryOS получает read-optimized engine без компромисса по auditability.

---

## Фаза 3. Retrieval semantics и recall quality

### Цель

После появления индекса сделать retrieval не просто быстрым, а архитектурно выразительным: с объяснимым ranking, bounded graph expansion и свежестью данных.

### Что делать

- определить query contract: intent, filters, time window, graph depth, confidence threshold, freshness scope
- развести canonical recall и runtime recall
- ввести explainable ranking:
  - lexical match
  - semantic similarity
  - graph proximity
  - recency/freshness
  - confidence/evidence weight
- формализовать recall bundles для адаптеров и агентов
- логировать retrieval traces отдельно от canon

### Артефакты фазы

- спецификация query/recall contract
- recall bundle schema
- тесты на ranking invariants и freshness boundaries

### Критерий готовности

Система умеет отвечать не только "что нашлось", но и "почему это было поднято именно сейчас".

---

## Фаза 4. First-class procedural canon

### Цель

Поднять procedural memory из полу-неявного runtime/competence слоя в полноценный, версионируемый и evidence-backed контур.

### Что делать

- определить отдельный canonical contract для procedures
- хранить procedure versions, acceptance criteria, provenance и feedback history
- отделить:
  - черновые runtime-процедуры
  - принятые canonical procedures
  - deprecated/superseded procedures
- добавить promotion path из runtime feedback в canonical procedure updates
- поддержать сравнение версий и rollback semantics

### Важное ограничение

Procedural canon не должен превращаться в свободно редактируемый набор промптов без evidence chain.

### Артефакты фазы

- schema для procedure records
- feedback-to-procedure promotion workflow
- verification rules для procedure lineage

### Критерий готовности

MemoryOS закрывает один из главных product gaps относительно более retrieval-ориентированных memory platforms.

---

## Фаза 5. Namespace / tenant / actor model

### Цель

Подготовить архитектуру к сценариям шире single-user workspace, не разрушая текущую file-first модель.

### Что делать

- ввести явные измерения изоляции:
  - `space_id`
  - `user_id`
  - `agent_id`
  - `role_id`
- определить, что из этого является canonical scope, а что operational scope
- встроить namespace semantics в gateway, adapters, runtime shadow и read index
- формализовать access boundaries и lock semantics для scoped canon operations
- не превращать это сразу в SaaS multi-tenancy; сначала сделать корректную адресацию и изоляцию моделей данных

### Артефакты фазы

- namespace contract
- обновлённые path/layout rules
- scoped query and promotion API

### Критерий готовности

Архитектура больше не предполагает молчаливо, что весь MemoryOS равен одному человеку и одному workspace.

---

## Фаза 6. Verify hardening и content-addressed reconciliation

### Цель

Убрать хрупкость verify-графа и перевести rebuild semantics на более строгую и объяснимую основу.

### Что делать

- уйти от логики, завязанной только на `mtime` и partial append heuristics
- считать изменения по content hash и canonical snapshot semantics
- поддержать два режима:
  - быстрый incremental reconcile
  - периодический full rebuild
- ввести детектирование stale edges, duplicate edges и orphaned references
- сделать verify отчётным, чтобы было видно:
  - что пересобрано
  - что признано устаревшим
  - что не бьётся с canon

### Артефакты фазы

- content-addressed graph reconciliation
- verify report contract
- negative tests на `git checkout`, restore и rebuild scenarios

### Критерий готовности

`manifest + graph` становятся не просто полезной проверкой, а действительно надёжным доказательным контуром.

---

## Фаза 7. Сужение product boundary

### Цель

Снизить архитектурную ширину v1 и уменьшить doc drift между memory core, control-plane и task/ops слоями.

### Что делать

- зафиксировать минимальный product boundary MemoryOS.v1
- явно разделить:
  - memory core
  - runtime/retrieval
  - connectors
  - operator surfaces
  - task/kanban/maintenance tooling
- выровнять package taxonomy, bundle docs и public package table
- убрать двусмысленности вокруг того, что является supported surface, а что internal/repo-local machinery
- сократить число мест, где одно и то же описывается разными словами

### Артефакты фазы

- единая package matrix
- единый supported-surface document
- cleaned architecture overview without taxonomy conflicts

### Критерий готовности

Документация и продуктовая граница снова совпадают, а change surface становится проще сопровождать.

---

## 4. Сквозные требования к каждой фазе

Каждую фазу стоит считать завершённой только если выполнены все пункты ниже:

- есть короткий architecture note: что меняем, что не меняем, почему
- есть capability boundary: кто имеет право это вызывать и писать
- есть rebuild story: как это восстанавливается из canon или вокруг canon
- есть verify story: как доказать целостность и отсутствие обходного write path
- есть adapter impact note: что меняется для OpenClaw, Codex, Claude
- есть regression plan: какие тесты и fixture checks обязательны

## 5. Рекомендуемый порядок выполнения

Если идти прагматично, а не максимально амбициозно, порядок такой:

1. `adapter-claude runtime contract`
2. derived read index
3. retrieval semantics and recall quality
4. procedural canon
5. namespace / tenant / actor model
6. verify hardening
7. product boundary simplification

Такой порядок даёт быстрый выигрыш по двум самым заметным слабым местам: connector completeness и read-path maturity.

## 6. Что не стоит делать раньше времени

- не заменять canon индексом или базой
- не превращать runtime в вторую truth layer
- не вводить multi-tenant orchestration раньше namespace contract
- не расширять control-plane до владения promotion logic
- не пытаться закрыть retrieval, procedural learning и tenant model в одной фазе
- не множить пакеты без жёстко сформулированной ownership boundary

## 7. Ожидаемый эффект

Если пройти эти фазы без размывания инвариантов, MemoryOS.v1 усилится по трём направлениям одновременно:

- сохранит сильную сторону: trusted, auditable, file-first canonical memory
- закроет главный product gap: read/retrieval quality и usable recall
- станет более убедительной как connector-ready и platform-capable memory architecture

В этом сценарии проект сможет конкурировать не только идеологически, но и практически: не только как canonical memory substrate, но и как полноценная high-trust memory platform.
