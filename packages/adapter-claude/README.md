# adapter-claude

Claude adapter scaffold for MemoryOS.v1.

This package exists to make the repository-level architecture explicit:
MemoryOS.v1 is the product core, and Claude is an optional adapter surface
alongside Codex and OpenClaw.

Current status:

- package scaffold only
- no runtime wiring yet
- no install manifest yet
- no supported execution contract yet

Use this package as the future home for Claude-specific bootstrap, runtime, and
handoff integration once the adapter contract is implemented.
