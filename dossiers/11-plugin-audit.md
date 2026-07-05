# 11 — Per-plugin audit: what the 35 marketplace plugins map to on Kiro

**Question:** does kiro-flow have the capabilities of the "All 35 plugins"
section on the ruflo README? **Short answer: about half are already live in the
core MCP we run; ~8 more are agent/command/skill packs convertible on demand;
~4 are external vertical runtimes we don't ship; ~3 are N-A/dropped on Kiro.**

## Method

- **Tools:** counted, per capability, how many tools exist in the **registered
  350-tool claude-flow MCP server** (`dossiers/tool-inventory.json`). "IN-CORE
  N" = N tools with that prefix are actually served to Kiro.
- **Ships:** each plugin's `agents/ commands/ skills/` counts
  (`plugins/<name>/`). These port via `kiro-flow convert agents --source`,
  `kiro-flow cmd`, `kiro-flow skills` respectively.
- **External:** whether the plugin delegates to a **separate npm runtime**
  (e.g. `npx neural-trader`) that is *not* part of the claude-flow server.
- No plugin declares its own `mcpServers` in `plugin.json`; the core plugin
  (`ruflo-core`) registers the one shared 300+/350-tool server that folds most
  plugin tools into it.

**Caveat (mostly closed):** "IN-CORE N" means the tools are *present in the
registered set*. Live end-to-end invocation was verified in the M1/parity/
M-series work for memory/agentdb/ruvector/embeddings/neural/hive/swarm/testgen/
analyze, and the parity-hardening probe (`scripts/mcp-parity-probe.mjs`, below)
now **drives browser, metaharness, daa, aidefence, workflow, federation, and
observability(metrics) live** — all return real handler output. Only `ruvllm`
remains undriven (N-A: local-LLM serving, moot when Kiro is the model provider).

## Parity-hardening probe — the asserted subsystems, driven live

`scripts/mcp-parity-probe.mjs` spins up the real `npx ruflo mcp start` server,
calls a representative tool from each previously-asserted subsystem with
schema-derived args, and classifies each response **real** (structured output),
**wired** (a domain error/`success:false` — still a real handler that validated
input), or **stub** (empty/echo/not-implemented). A subsystem passes only if no
probed tool is stub/fail. Result (kiro-cli 2.10.0, ruflo 3.0.0, 350 tools):

| subsystem | probed tools | verdict |
|---|---|---|
| aidefence | has_pii / is_safe / scan | **real** — `has_pii(PII)→hasPII:true`, `is_safe(injection)→safe:false,promptSafe:false`, `scan(PII)→piiFound:true` (semantic, not just wired) |
| observability(metrics) | system_metrics / performance_metrics / hooks_metrics | **real** — live `_real:true` cpu/mem + `_dataSource: intelligence-stats` |
| daa | daa_learning_status / daa_agent_create | **real** — created an agent, `learning_status.total` incremented across runs (real state) |
| workflow | workflow_list / workflow_create | **real** — created a workflow, it appears in the subsequent list |
| metaharness | metaharness_audit_list / metaharness_threat_model | **real** — audit namespace + generated threat model (schema 1) |
| federation | federation_bbs_register | **real handler, honestly degraded** — `success:true, degraded:true, reason:"agentbbs-not-found"` on a single machine (needs the agent-BBS peer service for full cross-machine; work-side item) |
| browser | browser_snapshot | **real** — returned an actual a11y snapshot (`"- document"`) of a blank page; no external browser download required |

Classifier + arg-builder are unit-tested (`test/parity-probe.test.mjs`, 6
tests); the live run stays out of the default suite (live-MCP contention hangs
`node --test test/`) — run `node scripts/mcp-parity-probe.mjs` by hand.

## The matrix

Legend — **core**: tools live in our 350 (+engine verified where noted) ·
**port**: no dedicated tools, delivered as agents/commands/skills → convert on
demand · **external**: needs a separate npm runtime we don't ship ·
**N-A**: no meaningful Kiro equivalent.

| Plugin | Core tools | Ships (a/c/s) | Verdict |
|---|---|---|---|
| ruflo-core | the 350-tool server itself | 4/2/4 | **core** — this *is* what kiro-flow registers |
| ruflo-swarm | swarm | 2/2/2 | **core** — M6 live (hive state mutated) |
| ruflo-autopilot | autopilot | 1/2/2 | **core** (tools present) |
| ruflo-loop-workers | via daemon/triggers | 1/2/2 | **core** — M5 daemon |
| ruflo-workflows | workflow ×12 | 3/8/5 | **core** |
| ruflo-federation | federation ×4 | 1/1/3 | **core/partial** — cross-machine = verify-at-work |
| ruflo-agentdb | agentdb ×20 | 1/2/2 | **core** — parity audit live |
| ruflo-rag-memory | memory + embeddings | 1/2/2 | **core** — memory_search_unified (M7) |
| ruflo-rvf | session ×… | 1/1/2 | **core** — session persistence (M7) |
| ruflo-ruvector | embeddings ×10, ruvector ×3 | 1/1/4 | **core/partial** — HNSW live; standalone `npx ruvector` is extra |
| ruflo-knowledge-graph | (0 dedicated) | 1/1/2 | **port** — agents/cmds/skills; some graph in `memory` |
| ruflo-intelligence | neural ×6 | 1/2/3 | **core** — M8 learning loop |
| ruflo-graph-intelligence | (PageRank in loop) | 0/0/0 | **partial** — used internally; no standalone tools |
| ruflo-daa | daa ×8 | 1/1/2 | **core** (tools present) |
| ruflo-ruvllm | ruvllm ×10 | 1/1/2 | **N-A** — local-LLM serving; moot when Kiro *is* the model provider |
| ruflo-goals | (0 goal_ tools) | 4/1/5 | **port** — goal-planner agents (in base library) |
| ruflo-testgen | via daemon | 1/1/3 | **core** — M5 live testgaps sweep |
| ruflo-browser | browser ×29 | 1/1/10 | **core/partial** — tools present; Kiro also has its own browser surface |
| ruflo-jujutsu | analyze ×… | 1/1/2 | **core** — analyze_diff family |
| ruflo-docs | (0 dedicated) | 1/1/2 | **port** — agents/cmds/skills |
| ruflo-security-audit | (0 dedicated) | 1/1/2 | **port** — agents/cmds/skills |
| ruflo-aidefence | aidefence ×7 | 1/1/2 | **core** (tools present) |
| ruflo-adr | (0 dedicated) | 1/1/4 | **port** |
| ruflo-ddd | (0 dedicated) | 1/1/3 | **port** |
| ruflo-sparc | (methodology) | 1/1/3 | **core** — via `cmd` + the sparc skill |
| ruflo-metaharness | metaharness ×15 | 1/1/13 | **core** (tools present) |
| ruflo-arena | (own src/mcp-tools, not in 350) | 0/1/0 | **external/port** — competitive ruliology; niche |
| ruflo-migrations | migrat ×1 | 1/1/2 | **partial/port** — thin tool + agent/cmds |
| ruflo-observability | observ ×6 | 1/1/2 | **core** (tools present) |
| ruflo-cost-tracker | (needs CC transcript) | 1/1/20 | **N-A/dropped** — no Kiro transcript (capability matrix) |
| ruflo-agent | agent/managed/wasm | 9/2/4 | **partial/N-A** — WASM worker plane ≈ ours; "Managed Agents" = Claude API, N-A |
| ruflo-plugin-creator | (meta scaffolding) | 1/1/2 | **port** — low relevance on Kiro |
| ruflo-iot-cognitum | (0 iot tools) | 4/1/5 | **external** — IoT runtime not shipped |
| ruflo-neural-trader | (0 in core; `npx neural-trader` ×112) | 4/1/9 | **external** — separate trading package |
| ruflo-market-data | (0 in core) | 1/1/2 | **external** — separate market-feed runtime |

## Tally

- **core (tools live in our 350, ~half verified live):** ~18 — core, swarm,
  autopilot, loop-workers, workflows, agentdb, rag-memory, rvf, ruvector,
  intelligence, daa, testgen, browser, jujutsu, aidefence, metaharness,
  observability, sparc (+ federation partial).
- **port (agents/commands/skills, convert on demand, no separate tools):** ~8 —
  knowledge-graph, goals, docs, security-audit, adr, ddd, plugin-creator,
  graph-intelligence/migrations (partial).
- **external (separate npm vertical runtime, not shipped):** ~4 —
  neural-trader, market-data, iot-cognitum, arena.
- **N-A / dropped on Kiro:** ~3 — cost-tracker (CC transcript), ruvllm
  (local LLM), ruflo-agent's Managed-Agents mode (Claude API).

## What this means

The core MCP server kiro-flow runs is a genuine **superset** that already
serves the tools behind roughly half the plugins. The only real *gaps* are the
domain verticals (trading, IoT, market data, arena), which ride separate npm
packages, and the handful that are structurally N-A on Kiro.

## The "port" tier is now shipped — `kiro-flow plugins` (M12)

All 8 port-tier plugins are **vendored into the package**
(`packages/kiro-flow/plugins/<name>/`, ~470 KB of agents/commands/skills) and
enabled with one reproducible command. They are vendored because `ruflo init`
does **not** install the plugins tree — ruflo pulls plugins from an IPFS
registry (`ruflo plugins install`), which is unreliable-to-blocked on a
governed work laptop. Shipping them in the package means zero network fetch at
work.

```bash
kiro-flow plugins list                 # 8 vendored, ● enabled / ○ available
kiro-flow plugins add ddd security-audit   # short or full (ruflo-…) names
kiro-flow plugins remove --all             # revert cleanly
```

**How it works** (mirrors `init --exclude`): the enabled set persists to
`.kiro/kiro-flow/plugins.json` and is **replayed by every `kiro-flow init`** —

- **agents** convert in the *same* dedup pass as the base library (fed as
  `extraSources`), so a plugin agent whose name collides with a base agent
  (`goal-planner`, `deep-researcher`) dedups instead of duplicating, and each
  plugin is mapped to the closest tool profile (ddd/adr→architecture,
  docs→documentation, goals→goal, kg→data, security→analysis);
- **skills** install to the auto-loaded `.kiro/skills/`;
- **commands** land namespaced under `.claude/commands/<short>/` so
  `kiro-flow cmd <name>` resolves them.

Disabling reconciles all three back out. The three kiro-flow flagships
(`kf-orchestrator/queen/deep-researcher`) are protected — `ruflo-goals` ships a
`deep-researcher` persona, but the flagship is never pruned. Verified end-to-end
(`plugins.test.mjs`, 9 tests; `init --plugins` integration test in
`init-doctor.test.mjs`).

| port-tier plugin | new agent(s) on enable | why you'd enable it |
|---|---|---|
| ruflo-ddd | kf-domain-modeler | bounded contexts, aggregates, domain events |
| ruflo-security-audit | kf-security-auditor | dependency/CVE scan, policy gates |
| ruflo-adr | kf-adr-architect | Architecture Decision Record lifecycle |
| ruflo-docs | kf-docs-writer | API docs (JSDoc/TSDoc/OpenAPI), drift |
| ruflo-knowledge-graph | kf-graph-navigator | entity extraction + graph traversal |
| ruflo-migrations | kf-migration-engineer | schema migration gen/validate/rollback |
| ruflo-plugin-creator | kf-plugin-developer | scaffold new plugins (meta; low relevance) |
| ruflo-goals | kf-dossier-investigator, kf-horizon-tracker (+goal-planner/deep-researcher already in base/flagship) | long-horizon GOAP planning, deep research |
