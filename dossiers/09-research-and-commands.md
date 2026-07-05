# 09 — Deep research & command triage

**Status:** built and verified live (kiro-cli 2.10.0, 2026-07-05). The plan's
verify — *headless cited research report with memory_store calls* — passed.

## Deep research on Kiro

Two upstream surprises reshaped this milestone, both favorable:

1. **There is no deep-research skill in published ruflo 3.23** — the bundle
   ships 34 skills (agentdb, github, sparc, swarm, v3-internal, …) but no
   research skill; only research-flavored *commands* (`swarm/research`,
   `sparc/researcher`). So the port is a fresh build, not a translation.
2. **Kiro has native `web_search` and `web_fetch`** (probed live — exactly
   the names the plan hoped for), so no MCP web dependency is needed.

### kf-deep-researcher (installed by init)

Agent: Kiro-native `web_search`/`web_fetch` (pre-trusted) + the `researcher`
claude-flow profile + `memory_store`; no shell. The persona
(`templates/prompts/kf-deep-researcher.md`) encodes the method: scope →
memory recall → ≥3-angle search sweep → fetch load-bearing sources (never
cite snippets) → two-independent-sources rule with explicit `(single source)`
markers → `memory_store` findings (namespace `research`) → fixed report shape
(TL;DR / numbered cited findings / open questions / annotated sources).

**Live verify:** headless run on a real question (Kiro model roster + credit
multipliers) produced a properly cited report — findings carried `[1][2]`
inline citations, conflicts and caveats surfaced honestly, sources annotated
primary/secondary with dates — and stored 2 findings in the `research`
namespace, confirmed present in the recall cache afterwards. 0.46 credits,
39 s. Those findings now auto-inject into future sessions via the M7 loop.

## Command triage — 166 commands

`ruflo init` installs 166 Claude Code slash-command prompt files under
`.claude/commands/`. Kiro has no slash-command surface, so:

**`kiro-flow cmd <id|name> [args…]`** resolves the command file (exact id or
unambiguous bare name, with suggestions), strips frontmatter, substitutes
`$ARGUMENTS` (or appends args as a section), applies the same kiroification
as the hive prompt (`mcp__…__` prefixes → bare names, Claude-Code-isms →
Kiro), and launches `kiro-cli chat --agent kf-orchestrator` (override with
`--agent`; `--no-interactive`, `--dry-run` supported).

`kiro-flow cmd --list` shows the curated top 20 (every id verified present in
the published bundle); `--list-all` dumps everything.

### Curated 20

swarm/research · swarm/development · swarm/analysis · swarm/testing ·
swarm/optimization · sparc/architect · sparc/code · sparc/tdd ·
sparc/security-review · sparc/refinement-optimization-mode ·
github/pr-manager · github/code-review · github/issue-tracker ·
github/release-manager · memory/memory-usage · memory/neural ·
analysis/performance-bottlenecks · automation/smart-agents ·
coordination/swarm-init · monitoring/swarm-monitor

### Category census (installed bundle)

| category | commands |
|---|---|
| sparc | 32 |
| github | 19 |
| swarm | 17 |
| agents | 13 |
| hive-mind | 12 |
| hooks | 8 |
| pair | 7 |
| coordination | 7 |
| automation | 7 |
| analysis | 7 |
| workflows | 6 |
| training | 6 |
| optimization | 6 |
| monitoring | 6 |
| memory | 5 |
| verify | 2 |
| stream-chain | 2 |
| truth | 1 |
| claude-flow-swarm | 1 |
| claude-flow-memory | 1 |
| claude-flow-help | 1 |

Triage notes: `sparc/*` (32) and `swarm/*` (17) are prompt-methodology files
that port cleanly (coordination via MCP tools, which kiroification renames).
`github/*` (19) assume the `gh` CLI on PATH — they work where `gh` is
installed and authenticated. `hive-mind/*` (12) overlap with `kiro-flow
hive-mind` (prefer the wrapper — it does the bookkeeping). `pair/*` (7) and
`stream-chain/*` (2) assume interactive Claude Code session mechanics —
degraded on Kiro, run them interactively or not at all. `training/*`,
`optimization/*`, `monitoring/*` lean on claude-flow MCP tools and port
cleanly.

### Full command list (appendix)

    agents/agent-capabilities agents/agent-coordination agents/agent-spawning 
    agents/agent-types agents/health agents/list agents/logs agents/metrics 
    agents/pool agents/README agents/spawn agents/status agents/stop 
    analysis/bottleneck-detect analysis/COMMAND_COMPLIANCE_REPORT 
    analysis/performance-bottlenecks analysis/performance-report 
    analysis/README analysis/token-efficiency analysis/token-usage 
    automation/auto-agent automation/README automation/self-healing 
    automation/session-memory automation/smart-agents automation/smart-spawn 
    automation/workflow-select claude-flow-help claude-flow-memory 
    claude-flow-swarm coordination/agent-spawn coordination/init 
    coordination/orchestrate coordination/README coordination/spawn 
    coordination/swarm-init coordination/task-orchestrate github/code-review 
    github/code-review-swarm github/github-modes github/github-swarm 
    github/issue-tracker github/issue-triage github/multi-repo-swarm 
    github/pr-enhance github/pr-manager github/project-board-sync github/README 
    github/release-manager github/release-swarm github/repo-analyze 
    github/repo-architect github/swarm-issue github/swarm-pr 
    github/sync-coordinator github/workflow-automation hive-mind/hive-mind 
    hive-mind/hive-mind-consensus hive-mind/hive-mind-init 
    hive-mind/hive-mind-memory hive-mind/hive-mind-metrics 
    hive-mind/hive-mind-resume hive-mind/hive-mind-sessions 
    hive-mind/hive-mind-spawn hive-mind/hive-mind-status 
    hive-mind/hive-mind-stop hive-mind/hive-mind-wizard hive-mind/README 
    hooks/overview hooks/post-edit hooks/post-task hooks/pre-edit 
    hooks/pre-task hooks/README hooks/session-end hooks/setup 
    memory/memory-persist memory/memory-search memory/memory-usage 
    memory/neural memory/README monitoring/agent-metrics monitoring/agents 
    monitoring/README monitoring/real-time-view monitoring/status 
    monitoring/swarm-monitor optimization/auto-topology 
    optimization/cache-manage optimization/parallel-execute 
    optimization/parallel-execution optimization/README 
    optimization/topology-optimize pair/commands pair/config pair/examples 
    pair/modes pair/README pair/session pair/start sparc/analyzer 
    sparc/architect sparc/ask sparc/batch-executor sparc/code sparc/coder 
    sparc/debug sparc/debugger sparc/designer sparc/devops sparc/docs-writer 
    sparc/documenter sparc/innovator sparc/integration sparc/mcp 
    sparc/memory-manager sparc/optimizer sparc/orchestrator 
    sparc/post-deployment-monitoring-mode sparc/refinement-optimization-mode 
    sparc/researcher sparc/reviewer sparc/security-review sparc/sparc 
    sparc/sparc-modes sparc/spec-pseudocode sparc/supabase-admin 
    sparc/swarm-coordinator sparc/tdd sparc/tester sparc/tutorial 
    sparc/workflow-manager stream-chain/pipeline stream-chain/run 
    swarm/analysis swarm/development swarm/examples swarm/maintenance 
    swarm/optimization swarm/README swarm/research swarm/swarm 
    swarm/swarm-analysis swarm/swarm-background swarm/swarm-init 
    swarm/swarm-modes swarm/swarm-monitor swarm/swarm-spawn swarm/swarm-status 
    swarm/swarm-strategies swarm/testing training/model-update 
    training/neural-patterns training/neural-train training/pattern-learn 
    training/README training/specialization truth/start verify/check 
    verify/start workflows/development workflows/README workflows/research 
    workflows/workflow-create workflows/workflow-execute 
    workflows/workflow-export 
## Work-side checklist (Kiro laptop)

- [ ] `web_search`/`web_fetch` availability under the employer Kiro build
      (some enterprise configs disable web tools) — one kf-deep-researcher
      smoke run answers it.
- [ ] `kiro-flow cmd github/pr-manager --dry-run` then a real run in a repo
      with `gh` authenticated.
