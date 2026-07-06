# Dossier 00 — ruflo architecture overview & Kiro port map

*Source: ruflo v3.23.0 (`reference/ruflo`, commit a5f86ad), verified July 2026.*

## Repo shape

- Marketing/prompt layer at root: `.claude/` (108 agent personas, 168 commands, skills, 40 helpers), `plugins/` (30 ruflo-* plugins, +56 agents), `CLAUDE.md` (55 KB).
- Real engine: TS monorepo `v3/@claude-flow/*` (~25 packages: cli, cli-core, mcp, memory, neural, swarm, hooks, providers, integration, guidance, codex, …) + Rust `crates/` (not on the runtime path).
- Published as npm **`ruflo`** (legacy alias `claude-flow`). `bin/cli.js` → `v3/@claude-flow/cli/bin/cli.js`; auto-detects MCP stdio mode when stdin is piped.

## The two execution architectures (the key porting fact)

1. **Claude Code CLI path** — `hive-mind.ts` (`claude -p --output-format stream-json --dangerously-skip-permissions`), `headless-worker-executor.ts` (`spawn('claude', ['--print'])`, prompt on stdin, plain-text stdout, gated on `execSync('claude --version')`), `worker-daemon.ts`, `teammate-bridge.ts`. **Blocker on Kiro** → replaced by the kiro-claude-shim.
2. **Direct-API provider path** — `agent-execute-core.ts` → api.anthropic.com; `@claude-flow/providers` (Anthropic/OpenAI/Google/Cohere/Ollama/RuVector); `integration/provider-adapter.ts`, `multi-model-router.ts`. Host-agnostic; unused at work (no API keys — Kiro is the provider).

An existing alternate-runner seam: `v3/@claude-flow/codex/src/dual-mode/orchestrator.ts` supports `platform: 'claude' | 'codex'` with configurable `claudeCommand`/`codexCommand` — proof the executor abstraction works; the shim exploits the same contract without forking.

## Subsystem verdicts (honest assessment)

| Subsystem | Reality | Port strategy |
|---|---|---|
| "100+ agents" | 108 markdown personas (+56 plugin), YAML frontmatter + prompt body; executed by CC's Task tool | Convert → `.kiro/agents/*.json` (M2) |
| Swarm/hive-mind | Real topology/consensus/Queen code; `agent_spawn` = in-memory state; LLM work delegated to `claude -p` or Task tool | Coordination unchanged; execution via shim / Kiro subagent tool (M5/M6) |
| Comms layer | In-process EventEmitter bus + shared SQLite + MCP; sockets only in federation | Ships inside MCP server — free (M1) |
| Memory | **Strongest**: better-sqlite3 + FTS5/BM25 + hand-written HNSW + agentdb/ruvector backends, hybrid search | Free via MCP (M1); ambient hooks (M7) |
| Neural/self-learning | Real small RL (DQN/PPO/A2C/SARSA) + ReasoningBank (retrieve→LLM-judge→distill→consolidate); SAFLA = branding | Judge via executor (M8) |
| Background workers | Real detached daemon, PID files, TTL, 12 triggers | PATH-injected shim (M5) |
| Multi-provider | Real 6-provider layer | Documented, dormant at work |
| Deep research | Prompt-orchestration skill over memory tools + WebSearch | Port skill, remap to Kiro web tools (M9) |
| Hooks | Real bridge to CC hook events + guidance injection | kiro-hook-adapter.cjs (M4) |
| MCP server | Real: ~299 tools / ~46 category files / stdio+http+ws | **Zero-change reuse** (M1) |

Optional heavy deps (`agentic-flow`, `agentdb`, `ruvector`) degrade gracefully to null when absent — do not bundle.

## Claude Code → Kiro mapping

| Claude Code | Kiro |
|---|---|
| `claude -p` headless | `kiro-cli chat --no-interactive --agent X --trust-tools=… --effort …` (KIRO_API_KEY, Pro+) |
| `.claude/agents/*.md` | `.kiro/agents/*.json` (prompt `file://`, hot-reload) |
| settings.json hooks (10 events) | agent-config hooks: sessionStart, userPromptSubmit, preToolUse (blocking), postToolUse, stop. No PreCompact/SubagentStart-Stop/Notification — degradations documented in M4 |
| Task tool | native `subagent` tool (≤4 parallel, DAG, trustedAgents) |
| `claude mcp add` / `.mcp.json` | `kiro-cli mcp add` / workspace `mcp.json` / `.kiro/settings/mcp.json` |
| CLAUDE.md | `.kiro/steering/*.md` |
| Skills | `skill://.kiro/skills/**/SKILL.md` resources |
| Plugins/marketplace | Kiro **Powers** (POWER.md + mcp.json + steering + hooks, keyword-triggered) |
| Session resume | `--resume-id` / `--list-sessions` |
| `~/.claude/projects/*.jsonl` transcripts (cost-tracker, auto-memory import) | **No equivalent — dropped**; hook-driven capture replaces it |

## Open unknowns (tracked)

1. kiro-cli headless output format — stream-json equivalent? (affects shim fidelity; fallback = file-based structured results)
2. Does work SAML/SSO login satisfy headless auth without an issued `KIRO_API_KEY`?
3. Kiro hook stdin payload / blocking-decision JSON schema (verify empirically in M4)
4. Does Kiro trim the model-visible tool list per agent `allowedTools`? (determines if mcp-proxy filter is needed)
5. Multi-process locking behavior of the hand-written HNSW index file
