# @nmc/memory-ingest

Engine-agnostic source normalization and provenance contracts for the Memory OS
migration.

This package currently centralizes the narrow `PR 1.1b` boundary:

- transcript event validation for existing OpenClaw JSONL fixtures
- extracted claim validation for `intake/pending/*.md`
- intake batch frontmatter validation against shared schema versions

The package stays pure. It does not read transcript files, traverse workspaces,
or mutate intake or canon files. Callers provide parsed objects and receive
structured validation results.

Current exports:

- `SOURCE_KINDS`
- `TRANSCRIPT_ROLES`
- `CLAIM_CONFIDENCE_LEVELS`
- `TARGET_LAYERS`
- `CLAIM_ID_PATTERN`
- `REQUIRED_BATCH_FRONTMATTER_FIELDS`
- `validateBatchFrontmatter(frontmatter)`
- `validateExtractedClaim(claim)`
- `validateTranscriptEvent(event)`

See [Memory OS Roadmap](../../docs/memory-os-roadmap.md) for the remaining
extractions.
