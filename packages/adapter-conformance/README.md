# adapter-conformance

Shared test-only conformance harness for Memory OS adapters.

Surface status: `internal` test-only package. It validates claimed adapter
capabilities and is not a production install, operator, or connector surface.

This package verifies only capability semantics that already exist in the
current migration slice:

- role-bundle loading
- `bootstrap(role)` and workspace bootstrap as separate capability claims
- canonical record and projection reads
- `status` and `verify`
- proposal, feedback, and completion handoff when the adapter claims write support
- shared CLI exit-code behavior when the adapter exposes a CLI hook

The suite stays data-driven: each adapter passes capability claims, operation
hooks, and fixture paths. Unsupported capabilities are skipped instead of being
turned into forward-looking protocol requirements.

See [Memory OS Roadmap](../../docs/legacy/memory-os-roadmap.md) for phase sequencing.
