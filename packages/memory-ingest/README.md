# @nmc/memory-ingest

Engine-agnostic source normalization and provenance contracts for MemoryOS.v1.

Surface status: `internal` shared core package inside the product boundary. It
is not a direct install, operator, or bounded connector surface.

This package owns ingest-side validation and provenance contracts:

- source and claim constants used at the ingest boundary
- transcript event validation for JSONL intake fixtures
- extracted claim validation for `intake/pending/*.md`
- intake batch frontmatter validation against shared schema versions

Boundaries:

- no transcript or workspace traversal
- no intake or canon mutation
- no adapter-specific setup behavior
- callers provide parsed objects and receive structured validation results

Primary exports include:

- `SOURCE_KINDS`
- `TRANSCRIPT_ROLES`
- `CLAIM_CONFIDENCE_LEVELS`
- `TARGET_LAYERS`
- `CLAIM_ID_PATTERN`
- `REQUIRED_BATCH_FRONTMATTER_FIELDS`
- `validateBatchFrontmatter(frontmatter)`
- `validateExtractedClaim(claim)`
- `validateTranscriptEvent(event)`
