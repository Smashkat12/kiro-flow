# 10 — Powers, distribution & the final capability matrix

**Status:** project complete (M0–M10, 2026-07-05). Everything below verified
at home on kiro-cli 2.10.0 (free tier); per-dossier work-side checklists
cover what only the employer environment can confirm (SSO headless auth, IDE
hook/Power behavior, governance).

## Distribution

Three ways to get kiro-flow onto a machine:

1. **One-liner** (mirrors ruflo's installer, kiro-cli check instead of
   Claude Code auto-install):
   `curl -fsSL https://cdn.jsdelivr.net/gh/smashkat12/kiro-flow@main/scripts/install.sh | bash`
2. **Local checkout**: `KIRO_FLOW_LOCAL=<checkout> bash scripts/install.sh`
   (what the clean-machine test uses).
3. **Power bundle** (`powers/kiro-flow/`, regenerate via `kiro-flow power
   pack`): POWER.md (keyword-triggered card) + mcp.json + steering +
   flagship agents (kf-orchestrator, kf-queen, kf-deep-researcher,
   kf-judge — all pass `kiro-cli agent validate`). Kiro **CLI** 2.10.0 has
   no `power` subcommand — Powers are an IDE surface, so IDE-side loading is
   a work-side checklist item.

Clean-machine test (fresh fake `$HOME` — cold npm cache, no Kiro auth;
PATH with no Claude Code; blank git repo): **passed.** `install.sh
(KIRO_FLOW_LOCAL=…)` checked requirements (kiro-cli found, Claude Code
correctly not required), cached ruflo, linked `kiro-flow`, and ran a full
init: 73 converted + 3 flagship agents, hook adapter, shim,
`node_modules/.bin/claude → shim`, global kf-judge into the fake `$HOME`.
Doctor on the produced workspace: all green (memory-db warn is the expected
pre-first-use state).

## Plugin survey

Upstream carries **37 plugins** with **56 dedicated plugin agents**
(`plugins/*/agents/*.md`; largest: ruflo-agent 9, neural-trader/iot/goals/core
4 each). The M2 converter ingests them unmodified — pointing it at the
plugins tree emits 235 valid agents (56 dedicated + agent-shaped command/
template files with frontmatter). The **8 "port-tier" plugins** (agent/command/
skill packs with no dedicated engine) are now **vendored + one-command
enablable** — `kiro-flow plugins add <name>` (M12, dossier 11): persisted to
`.kiro/kiro-flow/plugins.json`, replayed by init, agents merged into the same
dedup pass. Not installed by default — the 73-agent base library is already at
the edge of useful; enable plugins per need. (For raw ad-hoc conversion the
low-level path still exists: `kiro-flow convert agents --source <dir> --out
.kiro/agents`.)

## Final capability matrix

Legend: **ported** = works on Kiro, verified live · **rebuilt** = same
capability, new implementation · **partial** = works with documented
degradations · **documented** = available via another surface, not ported
as-is · **dropped** = no Kiro equivalent, documented.

| Capability (original ask) | Status | Evidence |
|---|---|---|
| 350-tool MCP server | **ported** (unmodified) | M1: 350 tools served to Kiro, memory round-trip; doctor handshake |
| 100+ agent personas | **ported** | M2: 108 personas → 88 valid agents (73 from published bundle at real sites); +56 plugin agents convertible (M10) |
| Hooks / ambient behaviors | **ported** | M4: adapter → unmodified ruflo kernel; safety block + learning rows verified live; exit-2-blocks + stdout-injection contract captured |
| Background workers / daemon | **ported** | M5: kiro-claude-shim; live testgaps sweep through kiro-cli (`success:true`); mock executor for CI |
| Swarm coordination | **ported** (unmodified) | M6: swarm layer is coordination-only JSON state + real consensus math — runs as-is; `kiro-flow swarm` wraps with Kiro guidance |
| Hive-mind / consensus | **ported** | M6: kf-queen session mutated ruflo's own hive state via real MCP tools (byzantine, shared memory) live |
| Comms layer | **partial** | M6: upstream "message bus" = shared JSON state → works as-is; CC Agent-Teams SendMessage plane has no Kiro equivalent → subagent fan-out + shared state (documented) |
| Vector memory (SQLite + HNSW) | **ported** (unmodified) | M1/M7: same `.swarm/memory.db` via MCP; M7 adds recall-cache injection (A→B recall verified live) |
| Self-learning / ReasoningBank | **ported** + honest notes | M8: fail→consolidate→inject loop live; kf-judge global agent + shim routing; SONA/MoE/HNSW-150× flagged as branding (upstream measures 1.9–4.7×) |
| Session persistence | **ported** | M7: KIRO_SESSION_ID bridge, `session list/resume`, per-spawn ruflo session restore |
| Multi-provider | **documented** (different root) | ruflo's 7-provider API layer is unused on the Kiro plane — Kiro itself multiplexes models (claude/deepseek/minimax/glm/qwen via `--model`); shim maps `ANTHROPIC_MODEL`, `KIRO_FLOW_MODEL_MAP` overrides |
| Deep research (RuFlow Research) | **rebuilt** | M9: no upstream skill exists; kf-deep-researcher on Kiro-native web_search/web_fetch; live cited report + memory_store verified |
| 166 slash-commands | **ported** | M9: `kiro-flow cmd <id>` runner ($ARGUMENTS + kiroification); curated 20 verified; full catalogue in dossier 09 |
| 34 skills | **ported** (opt-in) | M11 resources pass: Kiro DOES have a skills surface — `.kiro/skills/*/SKILL.md` auto-loads into every agent (verified via `/context show`). `kiro-flow skills add --core\|<name>\|--all` copies ruflo's 38 skills there; opt-in because all 38 = ~151k tokens always-on (curated core ~20k). `cmd`/steering/personas still cover the rest |
| Powers / team distribution | **built** (IDE verify pending) | M10: `powers/kiro-flow` bundle + `power pack`; install.sh; clean-machine test |
| Cost tracker | **rebuilt** | M14: ruflo reads CC transcripts; Kiro has none but every kiro-cli turn prints `▸ Credits: X`. The shim persists each daemon/worker/judge call to a workspace JSONL ledger; `kiro-flow cost` aggregates by model/entrypoint/day (→ USD via `KIRO_FLOW_CREDIT_USD`). Verified live (shim footer → ledger → report). Interactive plane logged via `cost add` |
| Web UI / agent dashboard | **rebuilt** (local) / **N-A** (hosted) | M15: ruflo's RuVocal web chat + goal.ruv.io dashboard are separate hosted apps with their own non-Kiro model providers (Docker+Mongo) → N-A on a governed Kiro laptop (Kiro itself is the chat frontend). But the telemetry those visualize is all local — `kiro-flow dashboard` renders one self-contained HTML page (agents, cost ledger, hive/swarm, learning, sessions), and `--serve` runs a **loopback-only** (127.0.0.1) auto-refreshing live view. Verified live in-browser (a CLI `cost add` appeared on the open page within one poll) |
| Statusline | **dropped** | CC-transcript/status-line-hook dependent; no Kiro equivalent |
| CC transcript import (auto-memory) | **dropped** | M7: no transcript tree on Kiro; capture flows via hooks + memory_store instead |
| PreCompact / Notification / Subagent* hooks | **dropped** | M4: no matching Kiro events (5-event surface) |
| Interactive stream-json plane | **dropped** | M6: hive queen runs as a normal kiro-cli chat; headless emits plain transcripts (shim's stream-json is a 2-line envelope) |

## The architecture in one paragraph

~80 % of ruflo's value was host-agnostic Node behind MCP, and it runs on Kiro
**unmodified**: the 350-tool server, the SQLite+HNSW memory, swarm/hive
state + consensus math, the learning kernel. The port is four thin seams —
the **hook adapter** (Kiro's 5 hook events ↔ CC contract), the **claude
shim** (`claude --print`/`-p` ↔ `kiro-cli chat --no-interactive`), the
**converter** (108 personas ↔ `.kiro/agents`), and **prompt kiroification**
(`mcp__x__y` ↔ bare names) — plus rebuilt planes where Claude Code itself
was the feature (interactive queen, deep research, command runner, recall
injection).

## Verification ledger (all local, kiro-cli 2.10.0)

- 128 automated tests green across M2–M15 suites
- Live: MCP 350-tool handshake · agent validation via real `kiro-cli agent
  validate` · hook safety block (`rm -rf /` stopped by ruflo's own rule) ·
  headless worker sweep · claude-less work-laptop simulation · hive session
  mutating shared state · A→B memory recall · judge verdict array · cited
  research report · clean-machine install (below) · port-tier plugin agent +
  skills + command live on kiro-cli (M12) · **parity-hardening probe** driving
  the 7 previously-asserted subsystems live (browser/metaharness/daa/aidefence/
  metrics/workflow/federation — all real handler output; `scripts/
  mcp-parity-probe.mjs`, dossier 11)

## Work-side checklist (final, consolidated)

The per-dossier lists (01–09) still apply; the M10 additions:

- [ ] Load `powers/kiro-flow` in the Kiro IDE — keyword triggering + agents
      visible (CLI cannot verify Powers).
- [ ] Clean-machine install on the actual work laptop via the employer
      software portal path (kiro-cli from portal, then install.sh).
- [ ] Governance sign-off recap: `--trust-all-tools` in queen/cmd launches,
      third-party npm (`ruflo`) via npx, `~/.kiro/agents` write (kf-judge),
      MIT/NOTICE attribution shipped.

## Deep-dependency parity audit (2026-07-05, post-M10)

Fresh folder outside the repo → `kiro-flow init` → `doctor` (live handshake:
**ruflo 3.0.0, 350 tools**) → direct JSON-RPC subsystem probes. The npx-cached
`ruflo` tree carries every heavy dependency, native bindings included:

| Dependency | Version | Status |
|---|---|---|
| agentdb | 2.0.0-alpha.3.7 | ✓ (controllers: tieredCache, reasoningBank) |
| ruvector (HNSW NAPI) | 0.2.33 | ✓ native `.node` loads |
| @claude-flow/neural | 3.0.0-alpha.9 | ✓ |
| @claude-flow/memory | 3.0.0-alpha.21 | ✓ |
| onnxruntime-node | 1.14.0 | ✓ |
| @xenova/transformers | 2.17.2 | ✓ (Xenova/all-MiniLM-L6-v2) |
| better-sqlite3 | 11.10.0 | ✓ native |
| sql.js | 1.14.1 | ✓ (WASM fallback) |

Live subsystem probes (all PASS): `memory_store`/`memory_search` semantic
recall (paraphrase query ranked the right entry first), `memory_search_unified`
(agentdb + claude-memory bridge — `memory_bridge_status`: 68 files/7 projects),
`agentdb_health`/`_controllers`/`_pattern-store`/`_pattern-search`,
`neural_patterns`, `hive-mind_status`, and `embeddings_generate` → **384-dim
vectors from the real ONNX model**.

**One operational gotcha (not a defect):** `embeddings_generate` returns
"Embeddings not initialized. Run embeddings/init first." until
`embeddings_init` is called once per fresh `.swarm/memory.db`. `memory_search`
does NOT need it (it lazy-inits its own HNSW+sql.js path — verified returning
results with `backend: "HNSW + sql.js"`), so ambient recall works out of the
box; only the standalone `embeddings_*` tools need the one-time init. After
init: `{model: Xenova/all-MiniLM-L6-v2, dimension: 384, hyperbolic: enabled,
neural: enabled}`.

**Verdict: full ruflo internals run on Kiro.** The MCP server is the real
3.23 engine with agentdb + ruvector-HNSW + ONNX embeddings live, not a
tool-name stub. Parity confirmed.

## M11 — native-agent enrichment (post-M10, 2026-07-05)

Making the converted agents genuinely *Kiro-native* rather than "ruflo agents
that validate". All verified live on kiro-cli 2.10.0.

- **#2 native tool budgets** — every kf-* agent gets Kiro-native read-only
  tools per role (`grep`/`glob`/`todo`/`thinking`, +`knowledge` for
  researcher/neural), all pre-trusted in `allowedTools`.
- **#3 per-agent model routing** — two capability tiers on the employer Kiro's
  real ids (`kiro-cli chat --list-models`, 2026-07): the reasoning-critical
  **flagships** (kf-judge/queen/orchestrator/deep-researcher) → **opus tier**
  `claude-opus-4.8`; the broad **library** core/researcher/neural → **strong**
  `claude-sonnet-4.6`; everyone else inherits `auto`. Tiers resolve through an
  overridable `.kiro/kiro-flow/model-map.json` — one file to re-point on a
  machine with different ids (e.g. the home free tier, which lacks
  opus-4.8/sonnet-4.6). `doctor` warns on a pinned model absent from
  `--list-models`.
- **#1 native subagent delegation** — 14 coordinators (core profile AND a
  coordinator/orchestrator/manager/queen name) emit `subagent` +
  `toolsSettings.subagent.{availableAgents,trustedAgents}` = the workspace core
  roster. **Empirically nailed down:** the config tool name `subagent` is what
  enables the runtime `use_subagent` fan-out (commands ListAgents /
  InvokeSubagents, ≤4 parallel) — `delegate` (listed in Kiro's own example
  config) does NOT. A coordinator ran ListAgents and returned exactly its
  roster; an off-roster workspace agent was excluded — so `availableAgents`
  both enables and *scopes* fan-out.

### Resources & skills — corrected model of Kiro's context surface

`/tools schema` + `/context show` probing overturned two earlier assumptions:

- **Kiro HAS a skills surface.** `skill://<name>` resolves to
  `.kiro/skills/<name>/SKILL.md`, and Kiro **auto-loads every
  `.kiro/skills/*/SKILL.md`** (and `~/.kiro/skills`) into *all* agents — no
  per-agent wiring needed, the file's presence is enough. So skills are ported
  via `kiro-flow skills` (copies ruflo's `.claude/skills/<name>` →
  `.kiro/skills/`). Opt-in, not in `init`: all 38 ≈ 151k tokens always-on;
  curated `--core` (sparc-methodology, swarm-orchestration, hooks-automation,
  verification-quality) ≈ 20k.
- **Steering already auto-loads too** via a default `.kiro/steering/**/*.md`
  glob — so no `file://` steering resource is emitted (it would just
  double-reference). Default CLI context = AmazonQ.md/AGENTS.md/README.md +
  those two globs.
- **`resources` entries must be `file://` or `skill://` strings** at chat
  runtime (a bare path errors). **The `knowledgeBase` object form is REJECTED**
  by kiro-cli 2.10.0 ("not valid under anyOf") — schema corrected; it is not a
  CLI capability whatever the IDE may expose.

### Flagship UX fields (M11 leftovers)

Probed the last three agent fields on kiro-cli 2.10.0:

- **`welcomeMessage`** — WORKS (prints on chat start, even `--no-interactive`).
  Added to the three interactive flagships (kf-orchestrator/queen/
  deep-researcher) as an orientation line. Deliberately **not** on kf-judge or
  library agents: they can run headless/as subagents, where a welcome would
  corrupt the shim's parsed output.
- **`keyboardShortcut`** — validates; IDE-only quick-launch (ctrl+alt+o/q/r on
  the flagships). Unverifiable from the CLI → work-side checklist item (may
  collide with IDE bindings; one-field edit if so).
- **`toolAliases`** — accepted but **no observable effect** (tested alias→real,
  real→alias, alias-in-`tools[]`; none renamed or resolved a tool — same as a
  bogus name). Emitted by nothing; documented in the schema as IDE-unverified,
  like `knowledgeBase`.

M11 native-agent enrichment is complete: #1 delegation, #2 native tools, #3
model routing, resources/skills surface, and flagship UX.

## M14 — cost tracking rebuilt on Kiro credits (post-M13)

ruflo's `cost-tracker` plugin reads Claude Code transcripts
(`~/.claude/projects/**/*.jsonl`) for token counts + USD. Kiro writes no
transcript tree — but every `kiro-cli` turn prints a `▸ Credits: X.XX` footer.
The rebuild persists that signal instead of parsing transcripts:

- **Capture (automatic):** the `kiro-claude-shim` already parses the footer for
  its result envelope; it now also appends one row per invocation to a
  workspace-local ledger `.kiro/kiro-flow/cost-ledger.jsonl`
  (`{ts, credits, model, entrypoint, session?, exit}`). This covers the
  automated planes the shim wraps — daemon background workers, headless
  `kiro-flow worker`, and the fable judge (`CLAUDE_ENTRYPOINT`) — i.e. the bulk
  of unattended spend. Best-effort: a ledger write never breaks a worker.
- **Report:** `kiro-flow cost [--since <days>] [--json]` aggregates the ledger —
  total credits, and breakdowns **by model / by entrypoint / by day** — with a
  USD column when `KIRO_FLOW_CREDIT_USD` (the same env the shim uses) is set.
- **Interactive plane:** raw `kiro-cli chat` and the stdio-inherited launches
  (`cmd`, `hive-mind`) show the footer live in the terminal but can't be
  auto-captured without breaking the interactive UX; log those with
  `kiro-flow cost add <credits> [--model m] [--note n]` (rows tagged
  `entrypoint: manual`). `kiro-flow cost clear` truncates the ledger.

**Coverage boundary (honest):** automated spend is captured end-to-end;
interactive spend is manual-entry. Verified live — a real shim→kiro-cli worker
call and a judge call both wrote credit rows, and `kiro-flow cost` reported them
by model/entrypoint/day. Pure logic (record/summarize/report) unit-tested in
`test/cost.test.mjs` (6 tests). This is the one "dropped" capability that had a
real Kiro-native signal to rebuild on; statusline stays dropped (no equivalent).

## M15 — local dashboard (rebuild of ruflo's hosted UI)

ruflo ships two web UIs — **RuVocal** (a SvelteKit multi-model chat, self-hosted
via Docker + Mongo, bundled at `node_modules/ruflo/src/chat-ui`) and the
**goal.ruv.io agent dashboard**. Both are **N-A on a governed Kiro laptop**:
they drive their *own* model providers (HuggingFace/OpenRouter → Qwen/Gemini/…),
not Kiro/Bedrock, so running them bypasses Kiro's governed models and billing —
and Kiro itself already fills the chat-frontend role. (If someone genuinely
wants RuVocal, it self-hosts standalone *beside* Kiro, not through it.)

What *is* worth rebuilding is the **telemetry view** — and every signal it shows
is produced locally by the stack we run. `kiro-flow dashboard` (`src/
dashboard.mjs`) reads them and renders **one self-contained HTML page** —
inline CSS/JS, theme-aware, responsive, **no network, no server, no Docker, no
external fonts/scripts** (safe to open on a locked-down machine):

- **overview cards** — agents (core/coordinator counts), plugins enabled, credit
  spend, memory.db size, hive sessions, kiro sessions + daemon state;
- **credit spend** — the M14 ledger as by-model / by-entrypoint bars + recent
  invocations (→ USD when `KIRO_FLOW_CREDIT_USD` is set);
- **hive / swarm** — sessions, shared-memory keys, consensus, topology;
- **learning** — routing accuracy, pattern counts, sessions (from
  `.claude-flow/metrics/learning.json`);
- **agents** — filterable table (name, model, profile, tool count, delegation
  roster, role), core/coordinator pills.

Two modes:

- **snapshot** — `kiro-flow dashboard [--open] [--out <file>] [--json]` writes
  `.kiro/kiro-flow/dashboard.html` (self-contained; shareable; re-run to
  refresh). The zero-port option.
- **live** — `kiro-flow dashboard --serve [--port 4173] [--interval 3]
  [--open]` starts a **loopback HTTP server bound to 127.0.0.1 only** (never
  network-exposed — the deliberate safety property for a governed laptop). The
  page polls a same-origin `/api/fragment` every `interval`s and swaps `<main>`
  in place (no full reload, no flicker; a green "live" dot + updating
  timestamp). There is no socket *into* the agents — they are the npx MCP
  engine / shim / hooks writing files (`.swarm/`, `.claude-flow/`, the cost
  ledger); the server just re-reads those on each poll, which is the correct
  architecture since the files *are* the real-time source of truth. Routes: `/`
  (live page), `/api/fragment` (fresh body), `/api/data` (raw JSON). Ctrl-C
  stops it.

Collector + renderers + the loopback server unit/integration-tested
(`test/dashboard.test.mjs`, 7 tests: reads all signals, empty-workspace
degradation, self-containment + HTML-escaping of untrusted agent descriptions,
bare-fragment shape, live-vs-static page markers, and a real ephemeral-port
server serving `/` `/api/fragment` `/api/data` + 404). Verified live in-browser
— a `cost add` from the CLI showed up on the open page within one poll (0.15 →
0.65 credits, no manual reload).
