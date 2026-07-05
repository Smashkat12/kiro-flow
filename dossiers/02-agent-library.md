# Dossier 02 — the agent library (108 personas → 88 Kiro agents)

*ruflo v3.23.0 `.claude/agents/**/*.md`, converted by `kiro-flow convert agents` (M2). All numbers verified against the reference corpus; regenerate anytime — output is deterministic and snapshot-tested.*

## The honest count

The marketing number is "108 agents". The corpus really contains:

- **108** `.md` files
- **−1** documentation file (`MIGRATION_SUMMARY.md`, `type: documentation`)
- **−9** `templates/` files (agent-format *examples*, not live personas — one of them, `github-pr-manager.md`, even collides with the real `github/pr-manager.md`)
- **−10** duplicate-name casualties (the same persona checked in twice, sometimes verbatim, sometimes as a stale older draft)
- = **88 unique live personas**, all converted, all ajv-valid against `schemas/kiro-agent.schema.json`.

### Duplicate resolution (longest body wins; tie → first path)

| name | kept | dropped | note |
|---|---|---|---|
| backend-dev | `development/dev-backend-api.md` | `development/backend/…` | kept the newer v2 "self-learning" persona |
| goal-planner | `goal/goal-planner.md` | `reasoning/goal-planner.md` | richer GOAP persona |
| database-specialist | `v3/…` | root | v3 rewrite wins |
| python-specialist | `v3/…` | root | v3 rewrite wins |
| typescript-specialist | `v3/…` | root | v3 rewrite wins |
| code-analyzer, sublinear-goal-planner, tdd-london-swarm, production-validator, project-coordinator | — | — | byte-identical copies, either kept |

## Taxonomy (source directory → tool profile)

| Category | # | Profile | Agents |
|---|---|---|---|
| github | 13 | github | pr-manager★, code-review-swarm, issue-tracker, release-manager, repo-architect, swarm-pr, swarm-issue, multi-repo-swarm, release-swarm, project-board-sync, sync-coordinator, workflow-automation, github-modes |
| v3 specialists | 9 | worker | database/python/typescript-specialist, test-architect, v3-integration-architect, v3-memory-specialist, v3-performance-engineer, v3-queen-coordinator, v3-security-architect |
| flow-nexus | 9 | worker | cloud-platform agents (see "dead weight" below) |
| consensus | 7 | core | byzantine/raft/gossip-coordinator, crdt-synchronizer, quorum-manager, security-manager, performance-benchmarker |
| core | 5 | worker (researcher→researcher, planner→core) | coder★, planner★, researcher★, reviewer★, tester★ |
| hive-mind | 5 | core | queen-coordinator★, collective-intelligence-coordinator★, swarm-memory-manager★, scout-explorer, worker-specialist |
| optimization | 5 | perf | benchmark-suite, load-balancing-coordinator, performance-monitor, resource-allocator, topology-optimizer |
| sublinear | 5 | core | consensus-coordinator, matrix-optimizer, pagerank-analyzer, performance-optimizer, trading-predictor |
| sparc | 4 | worker | specification, pseudocode, architecture, refinement |
| swarm | 3 | core | hierarchical/mesh/adaptive-coordinator |
| goal | 3 | researcher | goal-planner★, code-goal-planner, sublinear-goal-planner |
| dual-mode | 3 | core | dual-orchestrator, codex-coordinator, codex-worker |
| (root) | 3 | worker | base-template-generator, project-coordinator, security-auditor |
| analysis | 2 | researcher | code-analyzer★, analyst |
| testing | 2 | worker | tdd-london-swarm, production-validator |
| singles | 10 | varies | backend-dev★, cicd-engineer, api-docs, ml-developer, mobile-dev, safla-neural, sona-learning-optimizer, system-architect, agentic-payments, test-long-runner |

★ = the **core 12** — the only agents the M3 orchestrator registers in `availableAgents`/`trustedAgents`; the other 76 are converted but dormant until `kiro-flow agents enable <category>` (M3). Recorded per-agent as `core: true` in `agents-manifest.json`.

**Dead weight, converted anyway:** the 9 `flow-nexus/*` personas orchestrate ruvnet's paid cloud platform via `mcp__flow-nexus__*` tools we don't register — they're harmless prose without those tools. The 3 `dual-mode/*` agents assume a Codex CLI. Candidates for `enabled: false` at init time; kept for parity.

## What conversion does (per agent)

```
.claude/agents/github/pr-manager.md          .kiro/agents/kf-pr-manager.json
---                                          {
name: pr-manager                               "name": "kf-pr-manager",
description: |                          →       "description": "Comprehensive pull request…",
  Comprehensive pull request…                   "prompt": "file://./prompts/kf-pr-manager.md",
tools: Bash, Read, …,                           "tools": ["read","write","shell", "@claude-flow/…"×44],
  mcp__claude-flow__memory_usage, …             "allowedTools": ["read", "@claude-flow/…"×44],
---                                             "includeMcpJson": true
<persona body>                               }
                                             + .kiro/agents/prompts/kf-pr-manager.md  (body, byte-faithful)
```

Plus two meta files in `.kiro/kiro-flow/`: `agents-manifest.json` (name, source, category, profile, core, enabled) and `conversion-report.json` (skips, dedups, renames, drops, verify-at-work items).

### Tool-name mapping (Claude Code → Kiro)

Kiro built-ins verified against kiro.dev config reference (July 2026): `read`, `write`, `shell`; MCP refs `@server/tool`.

| Claude Code | Kiro | note |
|---|---|---|
| Bash | `shell` | |
| Read, Glob, Grep, LS, NotebookRead | `read` | Kiro's read covers list/search modes |
| Write, Edit, MultiEdit, NotebookEdit | `write` | |
| Task | `subagent` | **verify at work** — native Kiro fan-out tool, not in the docs' example list |
| TodoWrite/TodoRead, WebSearch/WebFetch, SlashCommand | *dropped* | no per-agent equivalent; web tools return with skills in M9 |
| `mcp__claude-flow__X` | `@claude-flow/X` | if X exists in the live 350-tool inventory |
| `mcp__github__X` etc. | `@github/X` | preserved; **that server must be registered by the user** (flagged in report) |

**v2→v3 renames** (13 agents' frontmatter references tools that no longer exist in ruflo v3): `task_orchestrate → task_create`, `memory_usage → memory_store + memory_retrieve + memory_search`, `bottleneck_analyze → performance_bottleneck`, `github_code_review → github_pr_manage`. Genuinely dead names (`parallel_execute`, `load_balance`, `automation_setup`, `github_sync_coord`) are dropped and recorded per-agent in the report — upstream's own personas have drifted from their v3 server.

### Tool budget & safety policy

- Each agent advertises only its **profile's** claude-flow tools (35–75 of 350, from `templates/tool-profiles.json`: core/worker/researcher/neural/github/perf) plus whatever its frontmatter explicitly asked for → the 350-tool context-bloat problem never reaches the model.
- `allowedTools` (auto-approved) = `read` + `@claude-flow/*` only. **`write`, `shell`, `subagent`, and foreign MCP servers always prompt** — sane default under employer governance; loosen per-agent if desired. Enforced by test (`unsafe allowedTools entry` invariant).
- Agents carry `includeMcpJson: true` and no embedded server block — the workspace `mcp.json` from M1 (server key `claude-flow`) is the single source of truth.

## Build artifacts

- `packages/kiro-flow/` — `bin/kiro-flow.js` (`convert agents --source --out --dry-run --inline-prompts`), `src/convert/{agents,frontmatter,tool-map}.mjs`, `data/claude-flow-tools.json` (350 live names)
- Tests: `npm test` in the package — 14 tests: frontmatter shapes, every mapping rule, corpus counts (108→88), ajv validation of all 88, safety invariants, determinism (double-run identical), 5 golden snapshots (researcher, pr-manager, backend-dev, queen-coordinator, repo-architect)

## Work-side verification checklist (Kiro laptop)

```bash
# 0. In a scratch repo that already passed the M1 checklist (mcp.json registered):
npx ruflo init --yes            # CLAUDE_FLOW_SETUP_MCP=0; produces .claude/agents
node <path>/kiro-flow.js convert agents          # → .kiro/agents/*.json

# 1. Kiro sees the agents
kiro-cli agent list                              # expect kf-researcher, kf-coder, … (88)

# 2. Persona + tools respond (answers M2's open questions in one shot)
kiro-cli chat --agent kf-researcher
#    Prompt: "Introduce yourself in one line, then store your research focus
#             under key m2-test with the claude-flow memory_store tool."
#    Expect: research-specialist persona voice; a mcp__claude-flow__ tool call
#            that does NOT prompt for permission (allowedTools working).

# 3. Persistence
npx -y ruflo memory search m2-test               # row in .swarm/memory.db

# 4. Open unknowns to record while there:
#    a. file://./prompts/… — does the prompt resolve relative to the config file?
#       (If persona voice is missing, retry a converted agent with --inline-prompts.)
#    b. does `subagent` appear as a usable tool for kf-repo-architect?
#    c. does Kiro advertise only the agent's `tools` list to the model, or the
#       full MCP server? (decides whether the mcp-proxy filter is needed — plan risk #3)
```

Open unknowns feed `conversion-report.json` → fix-forward in M3.
