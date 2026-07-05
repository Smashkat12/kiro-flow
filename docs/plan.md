# Plan: kiro-flow — recreate ruflo (claude-flow) for AWS Kiro

## Context

The user's employer runs **AWS Kiro** (Claude models via Kiro IDE + kiro-cli, authenticated through AWS SAML/SSO, Pro+ subscription) — not Claude Code. The goal is to replicate ruflo's one-line install experience and its full capability set (100+ agents, comms layer, swarm, self-learning, vector memory, background workers, multi-provider, deep research) on Kiro, while deeply understanding each subsystem along the way. Development happens at home (Claude Code Max available); deployment target is the work Kiro environment.

**Decisions made with user:** target = both Kiro CLI + IDE; headless `KIRO_API_KEY` availability = uncertain (SSO auth; design must work interactive-only, headless as an upgrade); approach = **Adapter package** (consume the published `ruflo` npm unmodified; do not fork).

## What the research established (verified against the cloned repo + kiro.dev docs)

**ruflo v3.23.0** (npm `ruflo`, legacy `claude-flow`; MIT; TS monorepo `v3/@claude-flow/*` ~25 packages):
- **Genuinely real & host-agnostic (~80% of the value, zero changes needed):** the MCP server (~299 tools across ~46 files in `v3/@claude-flow/cli/src/mcp-tools/`, stdio auto-detect), the memory engine (better-sqlite3 + FTS5/BM25 + hand-written HNSW vector index, hybrid search, `.swarm/memory.db`), swarm coordination (topology manager, Queen coordinator, Raft/Byzantine/gossip consensus, EventEmitter message bus), the worker daemon (detached, PID files, 12 triggers), a 6-provider API layer, real RL algorithms + ReasoningBank (retrieve → LLM-judge → distill → consolidate).
- **Prompt-layer, convertible:** 108 agent markdown personas in `.claude/agents/`, 168 slash commands, skills, CLAUDE.md, deep-research skill (`plugins/ruflo-goals/skills/deep-research/SKILL.md`).
- **Claude Code couplings (the port surface):** `headless-worker-executor.ts` probes `execSync('claude --version')` and runs `spawn('claude', ['--print'])` with prompt on stdin / plain text stdout (lines ~637–720, 1163–1215); `hive-mind.ts` `spawnClaudeCodeInstance()` uses `claude -p --output-format stream-json` (lines ~182–411); `.claude/settings.json` hook wiring + 40 helper scripts; init generators isolate all artifact output. The dual-mode orchestrator (`v3/@claude-flow/codex/src/dual-mode/orchestrator.ts`) already supports configurable `claudeCommand` per worker — an existing seam.
- ruflo's MCP server has **no serving-side tool filter** (`mcp-client.ts` registers all ~299; `listMCPTools(category)` exists at line 346 but is unexposed).

**Kiro capabilities:** `.kiro/agents/*.json` custom agents (prompt `file://`, tools/allowedTools/toolsSettings, per-agent `mcpServers`, hooks, `skill://` + knowledgeBase resources, hot-reload); hooks = `agentSpawn`, `userPromptSubmit`, `preToolUse` (blocking), `postToolUse`, `stop`; native `subagent` tool (≤4 parallel, DAG deps, `trustedAgents`); headless `kiro-cli chat --no-interactive --agent X --trust-tools=… --effort …` (docs say requires `KIRO_API_KEY`, Pro+); `kiro-cli mcp add` / workspace `mcp.json` / `.kiro/settings/mcp.json` (IDE); steering files; **Powers** (POWER.md + mcp.json + steering + hooks, keyword-triggered on-demand tool loading); Kiro CLI succeeds Amazon Q Developer CLI.

## Architecture (Adapter)

```
Kiro IDE / kiro-cli main session
  ├─ loads .kiro/agents/*.json (converted personas), steering, skills
  ├─ native subagent tool → interactive fan-out (≤4)          [Plane 1: no API key needed]
  └─ stdio MCP → ruflo MCP server (`npx ruflo mcp start`, UNMODIFIED)
        • ~299 tools, server key `claude-flow` (preserves mcp__claude-flow__* names)
        • owns .swarm/memory.db (WAL — shared substrate for all processes)

ruflo worker daemon (UNMODIFIED) ─spawns→ `claude --print`
        └→ resolves to kiro-claude-shim (a bin named `claude` on a private PATH,
           prepended only for processes kiro-flow launches)
             └→ kiro-cli chat --no-interactive --agent kf-worker …   [Plane 2: headless, needs key]

kiro-flow CLI (the new thin package): init | convert | daemon | swarm | agents | doctor
```

The shim emulates the exact verified contract: `--version` probe → probe kiro-cli auth (exit 1 ⇒ ruflo gracefully idles headless workers = interactive-only mode); `--print` → read stdin prompt → invoke kiro-cli headless → strip ANSI → pass through exit code; `--dangerously-skip-permissions` → scoped `--trust-tools` list by default (`--trust-all-tools` only if `KIRO_FLOW_TRUST_ALL=1`); unknown flags accepted-and-ignored; file-lock semaphore (default 4 slots, `KIRO_FLOW_MAX_CONCURRENT`) so daemon + swarm can't stampede account rate limits.

**Artifact conversion map** (`kiro-flow convert`, run after `ruflo init --yes` with `CLAUDE_FLOW_SETUP_MCP=0`):
| From | To |
|---|---|
| `.claude/agents/**/*.md` (108) | `.kiro/agents/<name>.json` + `prompts/<name>.md` (frontmatter→JSON, `prompt: file://`, tool-name map Read→fsRead etc., per-agent claude-flow tool allowlist). Only ~12 core agents registered in orchestrator `availableAgents`/`trustedAgents`; rest dormant until `kiro-flow agents enable <category>` |
| `.claude/commands/**/*.md` (168) | top workflow commands → `.kiro/skills/*/SKILL.md` (keyword-triggered); reference docs → one steering index |
| `.claude/skills/*` | `.kiro/skills/*` (near-copy; `mcp__claude-flow__*` names stay valid) |
| `CLAUDE.md` | `.kiro/steering/ruflo.md` (Task tool→subagent, `claude -p`→kiro-flow idioms) |
| settings.json hooks | hooks block in generated agent JSONs via `kiro-hook-adapter.cjs` → delegates to ruflo's unmodified `hook-handler.cjs`. Map: SessionStart→agentSpawn, Stop/SessionEnd→stop, Pre/PostToolUse→pre/postToolUse (blocking preserved), UserPromptSubmit→userPromptSubmit. PreCompact → debounced postToolUse + stop flush; SubagentStart/Stop → per-subagent-config agentSpawn/stop; Notification dropped |
| `.mcp.json` | workspace `mcp.json` (CLI) + `.kiro/settings/mcp.json` (IDE), server key `claude-flow` |
| `plugins/ruflo-*` (30) | Kiro **Powers** (Phase 3) |

**299-tool context bloat mitigation (in order):** per-agent allowlists → `kiro-flow mcp-proxy` (~150 LOC stdio `tools/list` filter, only if allowlists don't trim the model-visible list) → Powers category bundles → upstream PR adding `RUFLO_TOOL_CATEGORIES` to `registerTools()`.

## Workspace layout — `/home/smash/ruflo-kiro/`

```
reference/ruflo/                  # upstream clone (already present; pin to v3.23.0)
dossiers/                         # 00–10 capability dossiers (the "understand everything" deliverable)
schemas/                          # kiro-agent / kiro-mcp JSON schemas (ajv, CI-enforced)
packages/kiro-flow/               # bin/kiro-flow.js, shim/claude, src/{cli,convert/,shim/translate,proxy,daemon,doctor},
                                  # templates/ (kf-worker|kf-orchestrator|kf-queen.json, kiro-hook-adapter.cjs, steering)
scripts/{install.sh, mcp-smoke.mjs}
powers/                           # Phase-3 Power bundles
test-workspace/                   # scratch repo for init/e2e (gitignored)
docs/  LICENSE  NOTICE  README.md
```

## Milestones (each = study dossier → build → verify)

**M0 — Workspace + baseline (S):** git init the repo, pin reference clone, `npm i && npx ruflo --version` works, JSON-RPC initialize round-trip against `npx ruflo mcp start`, write `schemas/`, `dossiers/00-architecture-overview.md`, NOTICE (MIT attribution to ruvnet). Resolve unknown #1: kiro-cli headless output format (any stream-json equivalent?) and whether SSO login satisfies headless auth without `KIRO_API_KEY`.

**M1 — ruflo MCP server in Kiro (M) — biggest win, zero code:** dossier `01-mcp-server.md` = full 299-tool inventory + curated `core` (~60 tools) vs `full` profiles; `scripts/mcp-smoke.mjs` (initialize → tools/list ≥250 → memory_store/search round-trip). Work verification: `kiro-cli mcp add claude-flow -- npx -y ruflo mcp start`, then a headless/IDE prompt that hits `mcp__claude-flow__memory_store` and persists to `.swarm/memory.db`.

**M2 — Agent converter, 108 personas (M):** `kiro-flow convert agents`; ajv-clean output for all 108, snapshot tests; `dossiers/02-agent-library.md` taxonomy. Work: `kiro-cli agent list` shows kf-*; `--agent kf-researcher` responds in persona and stores findings.

**M3 — `kiro-flow init` + one-line install.sh (M):** mirrors ruflo's installer flag-for-flag but replaces the claude-code auto-install with a kiro-cli presence check; init = `ruflo init --yes` (MCP-add skipped) → convert → templates → steering → `kiro-flow doctor` (node/kiro-cli/auth/MCP handshake/db checks). Verify: idempotent double-run zero-diff in test-workspace; 2-minute onboarding demo.

**M4 — Hooks (M):** `kiro-hook-adapter.cjs` translating Kiro hook stdin JSON ↔ CC contract, delegating to unmodified ruflo handlers; inject hooks into generated agents; event-mapping doc incl. degradations. Verify at work: file edit → postToolUse row in memory.db; preToolUse safety rule blocks a dangerous command. Empirically capture Kiro's hook payload/decision schema first (risk #1).

**M5 — Headless executor + workers/daemon (L, highest risk):** the shim (`shim/claude` + unit-testable `src/shim/translate.ts`), PATH-injection daemon wrappers, golden argv+stdin contract tests replayed from recorded ruflo→claude invocations, `--executor claude|kiro|mock` for home/work/CI parity. Verify: home e2e with claude executor; work `kiro-flow daemon start` → PID file, `ultralearn`/`testgaps` workers visible as kiro-cli children, results consolidated into memory. Fallback if headless auth impossible at work: interactive-only mode (documented, doctor reports it) + optional `chat.enableDelegate`.

**M6 — Swarm/hive-mind (L):** `kiro-flow swarm run "<objective>" --topology mesh --max-agents 5` (coordination stays in-process; only LLM execution goes through executor); `kf-queen` agent using native subagent tool for the interactive plane; `kiro-flow hive-mind spawn` launches `kiro-cli chat --agent kf-queen` with ruflo's prompt file (replaces the stream-json interactive path). Dossier covers topologies/consensus/message bus (= Comms Layer + Swarm capabilities).

**M7 — Ambient memory + session persistence (M):** auto-memory via hooks (CC-transcript import has no Kiro equivalent — dropped, documented); agentSpawn hook injects top-k relevant memories; session bridge (Kiro `--resume-id` ↔ ruflo session records). Verify: decision told in session A is recalled in fresh session B.

**M8 — Self-learning/ReasoningBank (M):** judge step routed through the executor as headless `kf-judge`; guidance injection via userPromptSubmit hook. Verify: fail → consolidate → distilled memo visibly injected → retry succeeds. Dossier gives the honest real-RL-vs-SAFLA-branding assessment.

**M9 — Deep research + command triage (S/M):** port `deep-research` skill to `.kiro/skills/` (WebSearch/WebFetch → Kiro web_search/web_fetch); triage 168 commands, port top ~20; `dossiers/09` catalogues all. Verify: headless cited research report with memory_store calls.

**M10 — Powers + team distribution (M):** `powers/kiro-flow/` (POWER.md, mcp.json, steering, flagship agents — keyword loading also solves tool bloat); survey 30 plugins, convert the +56 plugin agents; clean-machine install test; final capability matrix (ported/partial/documented/dropped per capability).

Phasing: P1 = M0–M4 (full value with no API key), P2 = M5–M8 (headless plane), P3 = M9–M10. Rough part-time calendar: P1 ≈ weeks 1–4 (first employer demo after M1), P2 ≈ weeks 5–8, P3 ≈ weeks 9–11.

## Verification strategy (home vs work)

- **Home (no Kiro):** everything non-LLM is testable — vitest units, ajv schema CI on all generated `.kiro/**` JSON, MCP smoke script + MCP Inspector, golden argv snapshot tests for the shim, full orchestration e2e with `--executor claude` on the Max plan.
- **Work (Kiro):** each milestone has a short checklist of real `kiro-cli` commands (listed above) — behavior parity is by executor contract, not by host.

## Top risks

1. Kiro hook stdin/decision JSON schema undocumented → isolate in `kiro-hook-adapter.cjs`, verify empirically in M4 first.
2. Headless auth at work (SAML/SSO; docs say `KIRO_API_KEY` needs Pro+ — user's plan is Pro+ but key issuance under enterprise governance unknown) → P1 delivers full interactive value regardless; resolve in M0/M5.
3. 299-tool context overload → 4-layer mitigation stack (per-agent allowlists first).
4. Shim contract drift on ruflo upgrades → pinned `ruflo@~3.23`, golden contract tests, doctor version gate, upstream `--executor`/`RUFLO_TOOL_CATEGORIES` PRs as permanent fix.
5. Multi-process HNSW index locking unverified → fallback: workers use `npx ruflo memory …` CLI instead of per-worker MCP instances.
6. Employer governance: `--trust-all-tools` in unattended workers, third-party MCP servers/npm — scoped trust lists are the default; confirm OSS policy (MIT inbound is near-universally fine; ship NOTICE).

## First implementation steps (on approval)

1. M0: `git init` /home/smash/ruflo-kiro, layout above, pin reference, npm install in reference, MCP initialize smoke, write schemas + dossier 00 + NOTICE.
2. M1: build tool inventory + `scripts/mcp-smoke.mjs`; hand user the work-side checklist (`kiro-cli mcp add …`).
3. M2: agent converter with the tool-name mapping table + tests.
