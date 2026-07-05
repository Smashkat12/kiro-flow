# 06 — Swarm & hive-mind on Kiro

**Status:** built and verified live (kiro-cli 2.10.0, 2026-07-05).
Covers the plan's *Comms Layer* + *Swarm* capabilities.

## What swarm/hive-mind actually are in ruflo 3.23 (read from source)

The finding that shaped this milestone: **the swarm layer executes no LLM at
all.** `swarm init|start|coordinate` compute an agent plan, call the
`swarm_init` MCP tool, persist JSON state, and then *print* that execution
happens elsewhere (`commands/swarm.ts:543-547`). There are exactly two places
the `claude` binary is spawned in the whole CLI:

1. `services/headless-worker-executor.ts:1202` — the daemon's workers
   (already covered by the M5 shim), and
2. `commands/hive-mind.ts:326` — `hive-mind spawn --claude`: writes a ~4 KB
   queen coordination prompt to `.hive-mind/sessions/hive-mind-prompt-<id>.txt`
   and launches `claude` **interactively** (`stdio: 'inherit'`, prompt as a
   positional argv; `--non-interactive` adds `-p --output-format stream-json`).

Everything else — topologies, consensus, "message bus" — is in-process logic
over shared JSON state:

- **Topologies** (`hierarchical`, `mesh`, `hierarchical-mesh`, `ring`, `star`,
  `hybrid`, `adaptive`) are validated labels stored in state; there is no
  per-topology routing engine.
- **Consensus is real math**: `raft`/`byzantine`/`gossip`/`crdt`/`quorum`
  vote counting, byzantine-voter detection, quorum resolution
  (`mcp-tools/hive-mind-tools.ts:75-160`), persisted per-proposal.
- **The "message bus" is a stored config string.** Worker comms =
  `sharedMemory` and `consensus` arrays in
  `.claude-flow/hive-mind/state.json`, mutated via the `hive-mind_broadcast`
  / `hive-mind_memory` / `hive-mind_consensus` MCP tools.

Consequence: **everything except the two spawn sites runs on Kiro unmodified**
via the claude-flow MCP server. M6 only had to supply the interactive plane.

## What kiro-flow adds

### `kiro-flow swarm <args…>`
Pass-through to unmodified `ruflo swarm …` (with the executor env in place),
plus corrected next-step guidance after `init`/`start` — upstream's hint says
"claude -p / Claude Code Task tool"; ours says `kiro-flow hive-mind spawn`,
`kiro-cli chat --agent kf-orchestrator`, or `kiro-flow daemon start`.

### `kf-queen` agent (installed by init, next to kf-orchestrator)
Hive-mind persona (`templates/prompts/kf-queen.md`): claude-flow MCP tools
coordinate (hive/consensus/task/memory), the native `subagent` tool executes
via the registered kf-* roster, consensus reserved for material decisions.
Toolset = the `core` profile + `neural_patterns`, `neural_train`,
`workflow_create`, `hooks_intelligence_pattern-store` (the extra names the
generated briefing references). `kiro-cli agent validate` passes.

### `kiro-flow hive-mind spawn -o "<objective>" [--no-interactive]`
Replaces the Claude Code launch, reusing all upstream bookkeeping:

1. auto-`hive-mind init -t hierarchical-mesh` if no hive exists;
2. unmodified `ruflo hive-mind spawn --claude --dry-run …` — hive worker
   records + the prompt file, no launch;
3. **kiroify** the prompt → `…-kiro.txt`:
   - `mcp__ruflo__X` / `mcp__claude-flow__X` → bare `X` — verified
     empirically: Kiro presents MCP tools to the model by bare name (an agent
     with `@claude-flow/memory_store` lists the tool as `memory_store`);
   - Task-tool and native-tool references → `subagent` / `read, write, shell`;
   - `Claude Code` → `Kiro`;
4. launch `kiro-cli chat --trust-all-tools --agent kf-queen "<prompt>"`
   (interactive by default, `--no-interactive` for headless).

Other `hive-mind` subcommands (`status`, `task`, `consensus`, `broadcast`,
`memory`, …) pass through to ruflo untouched.

## Verification

Automated (`npm test`, 56 pass): kiroification against a verbatim slice of a
real generated prompt (no `mcp__` survivors, rewrites applied); prompt-file
discovery (newest wins, `-kiro` rewrites excluded); kf-queen schema validity,
hive toolset, subagent roster, hook block.

Live (home, headless):

- `kiro-flow hive-mind spawn -o "store 'hive-live-m6' under 'm6-probe' …"
  --no-interactive` → upstream init'd the hive (byzantine, hierarchical-mesh),
  wrote the prompt, and the **kf-queen session in kiro-cli called the real
  `hive-mind_memory` and `hive-mind_status` MCP tools** — afterwards
  `.claude-flow/hive-mind/state.json` contains
  `"sharedMemory": {"m6-probe": "hive-live-m6"}` with 2 workers registered.
  One state store, both sides.
- `kiro-flow swarm start -o …` → upstream plan + state written, Kiro guidance
  printed.

## Degradations (documented)

- Upstream's interactive hive session runs inside Claude Code with its Task
  tool; ours runs inside kiro-cli with the `subagent` tool. Subagent
  fan-out semantics (parallelism limits, nesting) are Kiro's, not CC's.
- `--non-interactive` upstream emits stream-json; our headless path is a
  normal `kiro-cli chat --no-interactive` transcript (no NDJSON events).
- Worker "processes" in the hive are records + subagents, not separate OS
  processes — same as upstream's default (non-`--claude`) behavior.

## Work-side checklist (Kiro laptop)

- [ ] `kiro-flow hive-mind spawn -o "<real objective>"` interactive: queen
      session opens in kiro-cli, subagent fan-out to kf-* works under the
      employer's Kiro build (verify the `subagent` tool is enabled there).
- [ ] `kiro-flow hive-mind consensus` / `status` from a second terminal while
      a queen session runs — shared state visible across processes.
- [ ] Confirm `--trust-all-tools` in the queen launch is acceptable under
      employer policy (swap for a scoped `--trust-tools` list if not).
