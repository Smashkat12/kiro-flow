# 05 — Headless executor: kiro-claude-shim + worker daemon

**Status:** built and verified locally (kiro-cli 2.10.0, free tier, 2026-07-05).
This was the plan's highest-risk milestone; the risk collapsed once kiro-cli
2.10.0 turned out to run `chat --no-interactive` headlessly under a plain
login (no `KIRO_API_KEY` needed at home — re-verify under SSO at work).

## The contract (recorded from published ruflo 3.23)

ruflo's background plane spawns the literal binary name **`claude`** via PATH
lookup, in exactly two shapes:

1. **Workers** (`headless-worker-executor.ts:1202`, used by the daemon's 12
   background workers):
   ```
   spawn('claude', ['--print'], { env, detached })   // prompt piped via stdin
   ```
   - env: `CLAUDE_CODE_HEADLESS=true`, `CLAUDE_CODE_SANDBOX_MODE=strict|permissive|disabled`
     (advisory env var only — no cloud sandbox on this path), `CLAUDE_ENTRYPOINT=worker`,
     `ANTHROPIC_MODEL=<alias or dated id>`
   - expects: plain text on stdout, exit 0 = success; on timeout the whole
     process group gets SIGTERM.
2. **Fable/judge harness** (`fable-harness.ts`, the M8 self-learning judge):
   ```
   claude -p --model <id> --output-format json --append-system-prompt <sys> --max-budget-usd <n>
   ```
   - expects: a JSON envelope on stdout — it reads `result` (string) and
     `total_cost_usd`/`cost_usd` (number, optional; falls back to an estimate).
3. **Availability probe**: `execSync('claude --version')` — only exit 0 matters
   (output cached as the version string).

## The shim

`packages/kiro-flow/shim/claude` (self-contained CJS; `shim/package.json`
pins `type: commonjs` inside the ESM package). `kiro-flow init` copies it to
`.kiro/kiro-flow/shim/claude` (0755). Translation:

| claude side | kiro side |
|---|---|
| `--print` / `-p`, prompt on stdin or positional | `kiro-cli chat --no-interactive --trust-all-tools <prompt>` |
| `--append-system-prompt S` | `S\n\n` prefixed to the prompt (Kiro has no system-prompt flag) |
| `--model` / `ANTHROPIC_MODEL`: `haiku`→`claude-haiku-4.5`, `sonnet`→`claude-sonnet-4.5`, `opus`→`claude-sonnet-4.5` (no Opus tier on Kiro — documented degradation); unknown ids → omitted, Kiro `auto` picks | `--model <mapped>` |
| `--output-format text` | cleaned stdout (ANSI/CSI/OSC, spinner frames, `>` marker, `▸ Credits:` footer stripped) |
| `--output-format json` | `{type:'result', subtype, is_error, result, session_id, kiro_credits, total_cost_usd?}` — cost emitted only when `KIRO_FLOW_CREDIT_USD` (USD per credit) is set |
| `--output-format stream-json` | minimal 2-line NDJSON (init + result) — enough for result-scanning consumers; documented degradation |
| `--max-budget-usd`, `--allowedTools`, `--permission-mode`, `--session-id`, … | parsed and ignored (never fatal) |
| `--version` | shim banner, exit 0 |

Env knobs: `KIRO_FLOW_EXECUTOR=mock` (deterministic, no LLM — CI),
`KIRO_FLOW_SHIM_AGENT`, `KIRO_FLOW_SHIM_TRUST_TOOLS`, `KIRO_FLOW_SHIM_EFFORT`,
`KIRO_FLOW_MODEL_MAP` (JSON merge), `KIRO_FLOW_CREDIT_USD`.

Exit codes pass through; kiro-cli runs in the same process group so ruflo's
group-SIGTERM timeout kill reaches it.

## PATH injection — and the npx trap

`kiro-flow daemon <start|stop|status|trigger|enable>` and `kiro-flow worker …`
wrap `npx ruflo daemon …` / `npx ruflo hooks worker …` with
`--executor kiro|claude|mock`:

- `kiro` (default): shim dir prepended to PATH
- `claude`: PATH untouched → native Claude Code (home/Max parity)
- `mock`: shim on PATH + `KIRO_FLOW_EXECUTOR=mock` (CI, $0)

**Trap found live:** npx prepends every `node_modules/.bin` from cwd *upward*
to the child PATH — ahead of anything the caller prepends. A forgotten
`claude` 1.x install in `$HOME/node_modules/.bin` silently beat the shim and
sent a worker to the real Anthropic API (404 on a stale model id). Fix:
`syncBinShim()` plants a `claude` symlink in the **workspace's own**
`node_modules/.bin` (first in npx's chain) for kiro/mock executors, and
removes exactly that symlink for `--executor claude`. A non-shim `claude`
already in the workspace bin is left alone with a warning.

`daemon start` adds `--headless` automatically (that flag is what routes
workers through the executor instead of the local no-LLM fallback).

## Verification

Automated (`npm test`, 50 pass): golden replays of both recorded argv shapes;
model mapping incl. opus degradation; env-knob argv reshaping; output cleaning
on a verbatim kiro-cli capture; envelope subtypes; shim-as-process in mock mode
(version probe, worker shape, fable envelope, stream-json, empty-prompt error);
executor env plumbing; workspace-vs-package shim resolution; and the load-bearing
one — a child spawning bare `claude --print` under `executorEnv('mock')`
resolves to the shim.

Live (home):
- shim → real kiro-cli: `claude --print` returned the response text; the fable
  shape returned a valid envelope with `kiro_credits` parsed from the footer.
- full stack: `kiro-flow daemon trigger -w testgaps --headless --executor mock`
  → ruflo's unmodified executor spawned `claude --print` → shim → success in 17 ms.
- full stack live: same trigger with `--executor kiro` → real
  `kiro-cli chat --no-interactive` visible as the worker's child process
  (result recorded in `.claude-flow/logs/headless/`).

## Work-side checklist (Kiro laptop, Pro+/SSO)

- [ ] `kiro-cli chat --no-interactive "say ok"` under SSO login — confirms the
      headless plane needs no `KIRO_API_KEY` at work either.
- [ ] `kiro-flow daemon start` → PID file, `kiro-flow daemon status`, workers
      visible as `kiro-cli` children, results in `.claude-flow/logs/headless/`.
- [ ] Confirm credit burn per worker sweep is acceptable (set
      `KIRO_FLOW_SHIM_EFFORT=low` and scope `--workers` if not).
- [ ] Check no ancestor `node_modules/.bin/claude` shadows the shim on work
      machines (`kiro-flow doctor` executor check + the syncBinShim warning).
