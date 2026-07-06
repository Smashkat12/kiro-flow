# 04 — Hooks: Kiro hook contract & the kiro-hook-adapter

**Status:** verified locally against kiro-cli **2.10.0** (free-tier account, 2026-07-05).
Everything in "Empirical findings" was captured live with a probe agent
(`test-workspace/m4-hooks/`, gitignored) — none of it comes from docs.
Raw captured payloads: `packages/kiro-flow/test/fixtures/kiro-hook-captures.ndjson`.

## Why this dossier exists

Risk #1 in docs/plan.md: Kiro's hook stdin/decision JSON schema is undocumented.
ruflo's entire ambient behavior (safety gates, learning substrate, auto-memory,
routing) hangs off Claude Code hooks, so porting it required knowing Kiro's
contract exactly. It turns out to be a near-clone of Claude Code's — the delta
is small and fully mechanical, which is what `kiro-hook-adapter.cjs` implements.

## Empirical findings — Kiro hook contract (kiro-cli 2.10.0)

### Declaration

Per-agent, in `.kiro/agents/*.json` (accepted by `kiro-cli agent validate`):

```json
"hooks": {
  "agentSpawn":       [ { "command": "..." } ],
  "userPromptSubmit": [ { "command": "..." } ],
  "preToolUse":       [ { "matcher": "fs_write", "command": "..." } ],
  "postToolUse":      [ { "matcher": "*",        "command": "..." } ],
  "stop":             [ { "command": "..." } ]
}
```

Commands run with **cwd = the directory kiro-cli was launched from** (relative
paths in `command` resolve against it — our hook blocks rely on this).

### stdin payload per event

Common fields: `hook_event_name` (same camelCase string as the config key), `cwd`.

| event | extra fields |
|---|---|
| `agentSpawn` | `prompt` (the initial prompt, in `--no-interactive`) |
| `userPromptSubmit` | `prompt` |
| `preToolUse` | `tool_name`, `tool_input` |
| `postToolUse` | `tool_name`, `tool_input`, `tool_response` `{success, result}` |
| `stop` | `assistant_response` |

Env: `KIRO_SESSION_ID` always; `USER_PROMPT` additionally on the two prompt
events. There is **no** `session_id`/`transcript_path` in the JSON (CC has both).

### Tool naming (as seen by hooks)

Built-ins use Kiro's *internal* names, not the agent-config names:
`fs_read`, `fs_write`, `execute_bash` (and presumably `use_aws`).
`fs_write` covers both create and edit, discriminated by `tool_input.command`
(`create` | `str_replace` | `insert` | …). `execute_bash` reports
`result[0].exit_status` as a **string**.

MCP tools appear as **`@server/tool`** — e.g. `@claude-flow/memory_store`.

### Matchers

- `"*"` matches everything.
- Exact internal name (`"fs_write"`) matches only that tool — verified that it
  does not fire for `execute_bash`/`fs_read`/MCP calls.
- Exact MCP ref (`"@claude-flow/memory_store"`) works.
- (Globs/regex untested; exact + `*` is all kiro-flow needs.)

### Decision protocol

- **exit 2 blocks the tool** (preToolUse). The model sees
  `PreToolHook blocked the tool execution: <hook stderr>` and no postToolUse fires.
- **exit 1 does NOT block** — verified: the command ran anyway. Only 2 is the
  block signal. This is why the adapter normalizes *any* handler failure to
  exit 2 (ruflo's own `pre-bash` blocks with exit 1, which would be a silent
  no-op if passed through).
- Multiple hooks on one event all run; one hook blocking does not stop the
  others from executing.
- **stdout is injected into model context** — verified for both
  `userPromptSubmit` and `agentSpawn` (the model could read a token printed by
  the hook). This is the channel M7 (memory injection) and M8 (guidance
  injection) will use.

## Event mapping — Claude Code ↔ Kiro

ruflo's `.claude/settings.json` (written by `ruflo init`) wires 10 CC events
into `.claude/helpers/hook-handler.cjs` subcommands. Kiro has 5 events:

| CC event (ruflo handler) | Kiro event | kf hook block |
|---|---|---|
| SessionStart → `session-restore` + auto-memory `import` | `agentSpawn` | `session-restore auto-memory:import` |
| UserPromptSubmit → `route` | `userPromptSubmit` | `route` |
| PreToolUse[Bash] → `pre-bash` (safety gate) | `preToolUse` matcher `execute_bash` | `pre-bash` |
| PreToolUse[Write\|Edit\|MultiEdit] → `pre-edit` | `preToolUse` matcher `fs_write` | `pre-edit` |
| PostToolUse[Write\|Edit\|MultiEdit] → `post-edit` (learning) | `postToolUse` matcher `fs_write` | `post-edit` |
| PostToolUse[Bash] → `post-bash` (upstream no-op passthrough) | `postToolUse` matcher `execute_bash` | `post-bash` |
| Stop → auto-memory `sync` | `stop` | `session-end auto-memory:sync` |
| SessionEnd → `session-end` (intelligence consolidation) | **merged into `stop`** | (above) |

**Degradations (documented, accepted):**

- `SessionEnd` has no Kiro equivalent → merged into `stop`. In interactive
  sessions `stop` fires per assistant turn, so consolidation runs per-turn
  instead of per-session. It is timeout-bounded (3 s) and idempotent; in
  `--no-interactive` (the worker plane) semantics are identical to CC.
- `PreCompact`, `Notification`, `SubagentStart`, `SubagentStop` → dropped
  (no Kiro event). Losses: compact-time state save, subagent status metrics.
- CC `Read` pre-hooks don't exist upstream (ruflo doesn't hook Read) — parity.

## The adapter

`packages/kiro-flow/templates/kiro-hook-adapter.cjs`, copied by `kiro-flow init`
to `.kiro/kiro-flow/kiro-hook-adapter.cjs`. Self-contained CJS, zero deps, and
delegates to the **unmodified** ruflo kernel that `ruflo init` already put in
`.claude/helpers/` (hook-handler.cjs, auto-memory-hook.mjs — found by walking
up from cwd, `$HOME` fallback).

```
kiro hook JSON ──translate──▶ CC hook JSON ──stdin──▶ .claude/helpers/hook-handler.cjs <cmd>
                                                   └▶ .claude/helpers/auto-memory-hook.mjs <cmd>  (auto-memory: prefix)
handler stdout ──▶ adapter stdout (context injection)
handler exit ≠ 0 ─▶ adapter exit 2 + stderr (Kiro block signal)
```

Translation rules:

| Kiro | Claude Code |
|---|---|
| `agentSpawn/userPromptSubmit/preToolUse/postToolUse/stop` | `SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/Stop` |
| `execute_bash {command, working_dir}` | `Bash {command}` |
| `fs_write {command:create, path, file_text}` | `Write {file_path, content}` |
| `fs_write {command:str_replace, path, old_str, new_str}` | `Edit {file_path, old_string, new_string}` |
| `fs_read {operations:[{path}]}` | `Read {file_path}` |
| `@server/tool` | `mcp__server__tool` |
| `tool_response.result[0].exit_status` (string) | additional numeric `exit_code` |
| env `KIRO_SESSION_ID` | `session_id` field |

Fail-open policy: missing helpers, malformed stdin, handler crash-by-timeout
(default 8 s, `KIRO_FLOW_HOOK_TIMEOUT_MS`) all exit 0 with a stderr note —
a broken hook must never wedge the agent. The **only** exit-2 path is a handler
that ran and returned non-zero (i.e. an intentional block).

## Verification

Automated (`npm test`, 36 pass): translation unit tests driven by the captured
fixture payloads; adapter process tests (stdout passthrough, block-on-nonzero,
multi-spec dispatch, fail-open × 3); converter injection tests; goldens updated.

Live e2e (home, kiro-cli 2.10.0, real ruflo helpers in `test-workspace/m3-e2e`):

1. `kf-backend-dev` created a file → post-edit + stop hooks ran the real kernel:
   session file, `graph-state.json` (3 nodes), `intelligence-snapshot.json`,
   `ranked-context.json` all written under `.claude-flow/`.
2. `echo 'rm -rf /'` → ruflo's own unmodified `pre-bash` dangerous-command rule
   fired: `PreToolHook blocked the tool execution: [BLOCKED] Dangerous command
   detected: rm -rf /` — command never executed.
3. `kiro-flow doctor` reports the new `hooks` check green; `kiro-cli agent
   validate` accepts every generated agent with hooks.

## Default agent — hooks on every bare `kiro-cli chat`

Hooks live on the **agent config**, so they fire per-agent. Two planes:

- `kiro-cli chat --agent kf-<name>` → the agent's `hooks` block fires. Verified
  live: a bare-prompt run printed Kiro's own `✓ 1 of 1 hooks finished` for each
  of `agentSpawn`, `userPromptSubmit`, `stop`, and a trace confirmed the full
  spec chains ran (`session-bridge memory-inject session-restore
  auto-memory:import` on spawn; `route` on prompt; `session-end auto-memory:sync
  session-bridge memory-refresh` on stop) with `KIRO_SESSION_ID` set.
- **Bare `kiro-cli chat`** (no `--agent`) → uses the built-in **`kiro_default`**
  agent (`--agent [default: plain]`), which has **no** hooks. So ambient
  behaviours don't run on a plain chat.

**Fix (CLI-native "always-on hooks"):** make a kf-* agent the default —
`kiro-cli agent set-default kf-orchestrator`. Then a bare `kiro-cli chat`
launches it and its hooks fire on every chat. Verified: after `set-default`,
`kiro-cli agent list` shows `* kf-orchestrator`, and a bare `kiro-cli chat
--no-interactive` fired all three lifecycle hooks (Kiro's `✓ … hooks finished`
+ trace). Revert with `kiro-cli agent set-default kiro_default`.

Wired into the installer as opt-in: `kiro-flow init --default-agent <name>`
runs `set-default` post-init (fail-open — missing kiro-cli or unknown agent
just prints a skip), threaded through `scripts/install.sh` as `--default-agent`
/ `-a` and `KIRO_FLOW_DEFAULT_AGENT`. kf-orchestrator is the heavy coordinator
(80 tools, delegation roster); every converted kf-* carries the identical hook
block, so a lighter default (e.g. `kf-coder`) gives the same ambient hooks
without the fan-out weight.

> **Not** the native `.kiro/hooks/**/*.kiro.hook` mechanism. Those are Kiro
> **IDE** Agent Hooks (file/tool-event triggers) — tested and they do **not**
> fire in the kiro-cli plane (a candidate hook with `trigger: UserPromptSubmit`
> never ran under `kiro-cli chat`). For a CLI workflow the default-agent route
> above is the mechanism; native hooks stay an IDE-only, unexplored surface.

## Work-side checklist (Kiro laptop, Pro+/SSO)

- [ ] `kiro-flow init` in a scratch repo, then `kiro-cli chat --agent
      kf-backend-dev "create scratch.txt saying hi"` → confirm
      `.claude-flow/data/graph-state.json` appears (learning substrate live).
- [ ] Same session: ask it to run `echo 'rm -rf /'` → confirm the
      `PreToolHook blocked` message (safety gate live).
- [ ] `kiro-flow init --default-agent kf-orchestrator` (or install.sh
      `--default-agent`), then a **bare** `kiro-cli chat --no-interactive "hi"`
      (no `--agent`) → confirm Kiro prints `✓ … hooks finished` (ambient hooks
      on every chat). Employer models mean no model-map override needed.
- [ ] Kiro **IDE**: confirm agent hooks fire there too (all local findings are
      CLI; IDE hook support/behavior unverified).
- [ ] Confirm enterprise policy allows agent hooks (some managed setups
      restrict arbitrary hook commands).
