# Dossier 03 — init, doctor, and the one-line install

*ruflo v3.23.0 installer + init studied against the reference clone and verified
empirically against the published npm package (July 2026). Built: `kiro-flow
init`, `kiro-flow doctor`, `scripts/install.sh`.*

## What ruflo's installer/init actually do (studied)

**`scripts/install.sh`** (392 lines): flags `--global/-g`, `--minimal/-m`,
`--setup-mcp`, `--doctor/-d`, `--init/-i`, `--no-init`, `--full/-f`,
`--version=X` (+ env `CLAUDE_FLOW_*`). Steps: banner → require Node ≥20 + npm →
**auto-`npm install -g @anthropic-ai/claude-code` if `claude` missing** → npm/npx
install ruflo → verify → optional `claude mcp add` (default **off**) → optional
doctor → `init --yes` → quickstart. The only Claude Code couplings are the
auto-install and the `claude mcp add` path.

**`ruflo init --yes`** (`commands/init.ts`, 1249 lines): generates `.claude/`
(settings.json + hooks, skills, commands, agents, helpers, statusline),
`CLAUDE.md`, `.mcp.json`, and the `.claude-flow/` runtime. It never calls
`claude mcp add`. Daemon/memory/swarm start only with `--start-daemon`/
`--start-all`. Two flags matter to us:

- `--no-global` — **without it, init appends a "Ruflo Integration" block to
  `~/.claude/CLAUDE.md`** (#1744). We always pass it.
- `--all-agents` — **dead flag in the published build**: the parser camelCases
  `--all-agents` → `flags.allAgents` (parser.ts:396) but init.ts reads
  `flags['all-agents']` (init.ts:236) — same bug class upstream fixed for
  `--no-global` in #2098A. Empirically confirmed: `init --yes --all-agents`
  copies only the 6-category default substrate (17 files).
  **Workaround** (used by `kiro-flow init`): chain `ruflo init upgrade
  --add-missing`, which reads both flag spellings and copies every bundled
  agent category (`executeUpgradeWithMissing`, executor.ts:708+).
  *Upstream PR candidate #1.*

**Published-bundle surprise:** the ruflo@3.23.0 tarball ships **89** agent
files, not the repo's 108 — and `core/` contains *only* `planner.md` (no coder/
researcher/reviewer/tester; no hive-mind/, dual-mode/, neural/, reasoning/
dirs). A real user site therefore converts to **73 kf-agents**, and 6 of the
"classic core 12" don't exist. Consequence: the orchestrator's
`availableAgents` is now **computed from the conversion manifest** against a
preference-ordered candidate list (`CORE_AGENT_PREFERENCE`, classic 12 first,
v3-era fallbacks after) — it never references an agent that wasn't emitted.

## What was built

### `kiro-flow init` (`src/init.mjs`)

```
1. npx ruflo@~3.23.0 init --yes --no-global      (skip if .claude/settings.json exists)
   npx ruflo@~3.23.0 init upgrade --add-missing  (full agent library workaround)
2. convert agents  → .kiro/agents/kf-*.json      (M2 converter; 73 at a real site)
3. mcp.json (CLI) + .kiro/settings/mcp.json (IDE) — server key claude-flow,
   merged non-destructively (foreign servers preserved)
4. .kiro/steering/ruflo.md                        (idiom-translation steering)
5. kf-orchestrator agent + prompt                 (subagent fan-out, core-N trusted)
```

Every write is compare-before-write → **double run is a byte-identical no-op**
(verified: unit test + real e2e in `test-workspace/m3-e2e`, 501 files, identical
md5 tree). `--force` reruns ruflo init; `--skip-ruflo-init` does only the
Kiro-side steps.

### `kiro-flow doctor` (`src/doctor.mjs`)

| check | fail/warn behavior |
|---|---|
| Node ≥ 20, npm | fail |
| kiro-cli present + version | fail (with kiro.dev/downloads pointer; IDE-only use still works) |
| Kiro auth (`whoami`, fallback `auth status`) | warn — command surface undocumented; records what worked (feeds open unknown #2) |
| claude-flow server in mcp.json / .kiro/settings/mcp.json | fail |
| live MCP handshake (initialize + tools/list ≥ 250, 120s budget) | fail/warn; `--no-mcp` skips |
| `.swarm/memory.db` | warn (appears on first memory_store) |
| kf-* agents present + parsable | fail |

Exit 1 only on `fail`; `--json` for scripting. Mirrors `ruflo doctor`'s check
list with Claude-Code checks swapped for Kiro ones.

### `scripts/install.sh`

Flag-for-flag mirror of upstream (`--global --minimal --doctor --init/--no-init
--full --version= --help`, env `RUFLO_VERSION`, `KIRO_FLOW_{MINIMAL,GLOBAL,…}`)
with two deliberate divergences:

1. Where ruflo auto-installs Claude Code, we **check for kiro-cli and print the
   install pointer** — never install an IDE/CLI unattended on a governed work
   machine (plan risk #6).
2. `--setup-mcp` is gone — MCP registration is workspace-scoped and handled by
   `kiro-flow init` (per-repo `.swarm/memory.db`, dossier 01).

kiro-flow itself installs via shallow clone to `~/.local/share/kiro-flow` +
symlink into `~/.local/bin` (`KIRO_FLOW_LOCAL=<checkout>` for dev,
`KIRO_FLOW_DRY_RUN=1` for a no-op preview). Once the repo is published to
GitHub, the documented one-liner becomes:

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/smashkat12/kiro-flow@main/scripts/install.sh | bash
```

## Verification

- Home: 22 tests green (`npm test` in `packages/kiro-flow/`): M2 suite + init
  artifacts, double-run byte-identity, mcp.json merge, orchestrator schema
  validity + exists-only trusted agents, doctor all-green with mocked kiro-cli
  and a fake 260-tool MCP server, doctor failure paths, install.sh syntax +
  dry-run.
- Home e2e: real `kiro-flow init` in `test-workspace/m3-e2e` (published ruflo,
  npx): 73 agents converted, idempotent rerun.

## Work-side checklist (Kiro laptop, ~2-minute onboarding demo)

```bash
mkdir demo && cd demo
KIRO_FLOW_LOCAL=<checkout> bash <checkout>/scripts/install.sh   # or the curl one-liner post-publish
kiro-flow doctor                       # expect: all green (auth check answers unknown #2)
kiro-flow models                       # tier→model map + which agents pin what; every
                                       # routed model should be ✓ (opus-4.8 / sonnet-4.6
                                       # exist on the employer Kiro). If any ✗, edit
                                       # .kiro/kiro-flow/model-map.json + rerun init.

# Skills — port ruflo's skill playbooks onto Kiro's auto-loaded .kiro/skills
# surface (M11 resources pass). This machine wants ALL skills:
kiro-flow skills add --all             # installs the full published set (~33 skills)
kiro-flow skills list                  # confirm ▪ installed + the always-on token total

# Drop the Flow Nexus hosted-cloud pieces (unused on a self-hosted/Bedrock Kiro):
kiro-flow skills remove flow-nexus-neural flow-nexus-platform flow-nexus-swarm
kiro-flow init --exclude flow-nexus    # drops the 9 flow-nexus agents; persisted
                                       # in .kiro/kiro-flow/exclude.json + pruned on
                                       # every re-init. (0 flow-nexus MCP tools exist,
                                       # so nothing to remove there.)

# Port-tier plugins (dossier 11) — vendored agent/command/skill packs that need
# no engine. Enable the ones you'll use (persisted; replayed on every re-init):
kiro-flow plugins list                 # 8 vendored, ● enabled / ○ available
kiro-flow plugins add ddd security-audit adr   # e.g. DDD + security + ADRs
#   → kf-domain-modeler / kf-security-auditor / kf-adr-architect agents,
#     their skills into .kiro/skills, their /commands under .claude/commands.
#   kiro-flow plugins remove --all   reverts cleanly.

kiro-cli agent list                    # expect kf-orchestrator + the kf-* library
kiro-cli chat --agent kf-orchestrator
#   Prompt: "Fan out: have kf-planner draft a 3-step plan for X and store it in memory."
#   Expect: subagent call → kf-planner, then @claude-flow/memory_store.
npx -y ruflo memory search "plan"      # row persisted in .swarm/memory.db
```

> **Cost of `skills add --all`:** every `.kiro/skills/*/SKILL.md` auto-loads
> into **every** agent's context (Kiro globs them in — no per-agent opt-out).
> The full published set is ~33 skills ≈ **~137k tokens always-on**. That is
> comfortable on the large windows of Sonnet / Opus 4.8 (the employer models),
> and `kiro-flow doctor` reports it as ok. If you later run tighter-window
> models or add plugin skills and agents start truncating, trim back:
> `kiro-flow skills remove --all && kiro-flow skills add --core` (curated 4,
> ~20k), or remove individually (`kiro-flow skills list` shows per-skill cost).
> Re-run `kiro-flow skills add --all` any time — it is idempotent.

Record in this dossier afterwards: the auth-probe command that worked, and
whether `kiro-cli agent list` picks up `.kiro/agents/` workspace-locally.

## Open unknowns (M3 additions)

- Does Kiro resolve `file://./prompts/…` relative to the agent JSON? (M2 #a —
  first thing to check in the demo; fallback `--inline-prompts`.)
- Auth probe command surface (`kiro-cli whoami` vs `auth status` vs other).
- Upstream PR candidates: fix `--all-agents` kebab/camel read; env-gated
  category filter in `registerTools()` (from dossier 01).
