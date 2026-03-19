# @nmc/memory-contracts

Dependency-free shared contracts for the Memory OS migration.

Surface status: `internal` shared core package inside the product boundary. It
is not a direct install, operator, or bounded connector surface.

This package currently centralizes the narrow PR 1.1 boundary:

- shared record envelope constants and validators
- canonical record-type contracts, including versioned `procedure` records
- schema-version compatibility helpers
- shared exit-code semantics used by the existing scripts
- pipeline adapter protocol helpers for LLM phase invocation boundaries

The package intentionally stays pure and does not read files or walk canon
directories. Callers provide parsed objects and receive structured validation
results.

Current exports:

- `CURRENT_SCHEMA_VERSION`
- `SCHEMA_VERSION`
- `SUPPORTED_SCHEMA_VERSIONS`
- `RECORD_TYPES`
- `RECORD_TYPE_PREFIXES`
- `CONFIDENCE_LEVELS`
- `RECORD_STATUSES_BY_TYPE`
- `REQUIRED_RECORD_FIELDS`
- `EXIT_CODES`
- `VALIDATION_ERROR_CODES`
- `PIPELINE_ADAPTER_PHASES`
- `PIPELINE_ADAPTER_METHODS`
- `validatePipelineAdapter(adapter)`
- `validatePipelineInvocation(invocation)`
- `getPipelineInvocation(adapter, phase, options)`
- `formatPipelineInvocation(invocation)`
- `isSupportedSchemaVersion(value)`
- `validateSchemaVersion(value[, path])`
- `isKnownRecordType(value)`
- `validateRecordEnvelope(record)`
- `validateRecordBlock({ anchorId, headingId, record })`

See [Memory OS Roadmap](../../docs/legacy/memory-os-roadmap.md) for the remaining
extractions.
