# @nmc/memory-contracts

Dependency-free shared contracts for MemoryOS.v1.

Surface status: `internal` shared core package inside the product boundary. It
is not a direct install, operator, or bounded connector surface.

This package owns the shared contract layer:

- shared record envelope constants and validators
- canonical record-type contracts, including versioned `procedure` records
- namespace-scoping helpers used across gateway, runtime, and control-plane
- schema-version compatibility helpers
- shared exit-code semantics
- pipeline adapter protocol helpers for the LLM-owned `extract` and `curate`
  invocation boundaries

Boundaries:

- no file I/O
- no canon traversal
- no runtime or adapter ownership
- callers provide parsed objects and receive structured validation results

Primary exports include:

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
