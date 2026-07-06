# 07 — Ambient memory & session persistence

**Status:** built and verified live (kiro-cli 2.10.0, 2026-07-05). The plan's
acceptance test — *a decision told in session A is recalled in a fresh
session B* — passes: stored via `memory_store` in A, answered verbatim in B
with **no tool calls** (the answer arrived through injected context).

## The mechanism

M4 verified that Kiro injects a hook's stdout into model context on
`sessionStart` and `userPromptSubmit`. M7 puts memory on that channel.

The constraint that shaped the design: `npx ruflo memory search` costs
**15–30 s per call** (CLI startup dominates — measured). That can never sit
inside a hook Kiro is waiting on. So recall is split into a fast read path
and a slow, detached write path:

```
stop hook ──▶ memory-refresh ──▶ detached `ruflo memory export -o recall-cache.json`
                                          (15–30 s, nobody waits)
sessionStart ─▶ memory-inject ──▶ read recall-cache.json, lexical top-k vs the
                                 spawn prompt, print block   (<10 ms, injected)
```

- **Cache**: `.claude-flow/kiro-flow/recall-cache.json` — verbatim
  `ruflo memory export -f json` output (`{count, entries:[{key, namespace,
  value, createdAt, updatedAt, …}]}`), i.e. the same `.swarm/memory.db` the
  MCP `memory_store`/`memory_search` tools use. One memory, two speeds.
- **Scoring** (adapter builtin, zero deps): token overlap against the spawn
  prompt + namespace boost (`decisions`/`patterns`/`solutions`) + 7-day
  recency boost. Prompt-less spawns fall back to namespace/recency ranking.
  Deliberately lexical — the HNSW search built the cache; this just surfaces
  the obviously relevant rows instantly.
- **Staleness**: cache older than `KIRO_FLOW_RECALL_TTL_MS` (default 15 min)
  triggers a detached refresh that benefits the *next* spawn. `kiro-flow
  memory refresh` is the synchronous manual/CI variant. Top-k via
  `KIRO_FLOW_RECALL_TOPK` (default 5).

Injected block shape:

```
[kiro-flow recall] Relevant memories from earlier sessions (claude-flow memory):
- [decisions] gateway-framework: We chose Fastify over Express …
```

## Hook chains after M7 (buildKfHooks)

| event | chain |
|---|---|
| sessionStart | `session-bridge memory-inject session-restore auto-memory:import` (inject early so context lands even if ruflo handlers are slow) |
| userPromptSubmit | `route` (fast in-process ranked context, unchanged from M4) |
| stop | `session-end auto-memory:sync session-bridge memory-refresh` |

`memory-inject`, `memory-refresh`, `session-bridge` are adapter builtins —
in-process, fail-open, no site dependencies.

## Session bridge

`session-bridge` records `KIRO_SESSION_ID` (hook env) into
`.claude-flow/kiro-flow/kiro-sessions.json`: first/last seen, prompt head on
sessionStart, response head on stop.

- `kiro-flow session list` — joins `kiro-cli chat --list-sessions --format
  json` with the bridge records (● = ruflo hooks were active).
- `kiro-flow session resume <id>` — `kiro-cli chat --resume-id <id>`
  (`--agent kf-…` optional). Kiro owns transcript persistence; ruflo-side
  session state (`.claude-flow/sessions/`) is restored per-spawn by the
  existing `session-restore` handler.

## Dropped (documented): CC-transcript import

Upstream's SessionStart auto-memory import bridges **Claude Code's**
auto-memory markdown (`~/.claude/projects/*/memory/*.md`) into the backend.
Kiro has no equivalent transcript/memory-file tree, so that import path is a
warn-level no-op on a work machine. Not a real loss on Kiro: ambient capture
still flows from post-edit/post-task learning hooks, agent `memory_store`
calls, and the auto-memory sync store (`.claude-flow/data/auto-memory-store.json`),
all of which we verified writing in M4/M7. Kiro *steering* files remain the
right place for durable human-authored context.

## Verification

Automated (`npm test`, 64 pass): path agreement between adapter and CLI;
scoring (relevant wins, unrelated filtered, prompt-less fallback); block
formatting; adapter process tests (cache hit injects, missing cache is
silent + fail-open even with a broken ruflo spec); bridge process test
(sessionStart records, stop updates); session join (merge, bridge-only rows,
ordering).

Live (home): session A (`kf-backend-dev`) stored the Fastify decision via
`memory_store` → `kiro-flow memory refresh` (2 entries) → fresh session B
asked "which framework did we choose?" and answered **without tools in 2 s**;
`kiro-sessions.json` holds both session ids with prompt/response heads;
`kiro-flow session list` renders the joined view.

## Work-side checklist (Kiro laptop)

- [ ] Confirm hooks see `KIRO_SESSION_ID` under the employer build (bridge
      depends on it; `session list` shows ● when it works).
- [ ] One A→B recall round-trip on a real project (store decision, refresh,
      fresh session recalls).
- [ ] Check the detached `npx ruflo memory export` is acceptable on the work
      network (first run downloads the package to the npx cache).
