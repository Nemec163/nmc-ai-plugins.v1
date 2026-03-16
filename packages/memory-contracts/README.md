# @nmc/memory-contracts

Dependency-free shared contracts for the Memory OS migration.

This package currently centralizes the narrow PR 1.1 boundary:

- shared record envelope constants and validators
- schema-version compatibility helpers
- shared exit-code semantics used by the existing scripts

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
- `isSupportedSchemaVersion(value)`
- `validateSchemaVersion(value[, path])`
- `isKnownRecordType(value)`
- `validateRecordEnvelope(record)`
- `validateRecordBlock({ anchorId, headingId, record })`

See [Memory OS Roadmap](../../docs/memory-os-roadmap.md) for the remaining
extractions.
