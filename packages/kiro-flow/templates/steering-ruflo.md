# ruflo on Kiro (kiro-flow)

This workspace runs [ruflo](https://github.com/ruvnet/ruflo)'s orchestration
substrate through Kiro. The `claude-flow` MCP server (registered in `mcp.json`)
provides memory, swarm coordination, task, and learning tools; the `kf-*`
custom agents in `.kiro/agents/` are ruflo's personas converted for Kiro.

## Idiom translation (ruflo docs → this workspace)

| ruflo / Claude Code idiom | Here |
|---|---|
| `Task("...", "...", "coder")` fan-out | `subagent` tool → `kf-coder` (≤4 parallel) |
| `mcp__claude-flow__<tool>` | same tools, referenced as `@claude-flow/<tool>` |
| `claude -p "..."` headless workers | `kiro-flow daemon` (M5) — not yet wired |
| `npx claude-flow@v3alpha <cmd>` | `npx ruflo <cmd>` (same CLI) |
| TodoWrite batching | Kiro's native task/plan facilities |

## Memory discipline (the part worth keeping)

- Before non-trivial tasks: `memory_search` for prior patterns
  (`--namespace patterns`) and similar past work.
- After completing work: `memory_store` the outcome — what worked, what
  failed — so future sessions (and other agents) retrieve it.
- All memory lives in `.swarm/memory.db` (SQLite + vector index), shared by
  every agent and the MCP server. It persists across sessions.

## Swarm defaults (anti-drift, from upstream ADRs)

- Topology `hierarchical`, max 6–8 agents, strategy `specialized`.
- Coordinate via `@claude-flow/swarm_init` + `@claude-flow/task_create`;
  execute via `subagent` fan-out to `kf-*` agents. MCP tools coordinate;
  subagents do the actual work.
- Only the core 12 agents are registered with the orchestrator by default;
  the rest of the library sits in `.kiro/agents/` (see
  `.kiro/kiro-flow/agents-manifest.json`).

## Ground rules

- Never edit `.kiro/agents/kf-*.json` by hand — they are generated; rerun
  `kiro-flow convert agents` after upgrading ruflo.
- `.swarm/`, `.claude-flow/`, and `.claude/` are ruflo's runtime/source
  artifacts — leave them out of code reviews and don't commit secrets there.
