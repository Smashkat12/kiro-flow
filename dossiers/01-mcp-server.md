# Dossier 01 — ruflo MCP server on Kiro

*Verified locally July 2026 against `npx -y ruflo mcp start` (ruflo v3.23.0; serverInfo reports `ruflo 3.0.0`).*

## Facts

- Transport: stdio, newline-delimited JSON-RPC (`initialize`, `tools/list`, `tools/call`, `ping`). The CLI auto-detects MCP mode when stdin is piped — `npx -y ruflo mcp start` is all Kiro needs.
- **350 tools in 35 categories** (see `01-tool-inventory.generated.md` / `tool-inventory.json`, regenerate with `node scripts/dump-tools.mjs`). Top categories: hooks 44, browser 29, wasm 27, agentdb 20, memory 15, metaharness 15, workflow 12, claims 12.
- Server key must be **`claude-flow`** so tools resolve as `mcp__claude-flow__*` — every ruflo persona/skill references that namespace (upstream keeps it deliberately, see their issue #2206).
- Working directory matters: the server owns `.swarm/memory.db` relative to cwd (or `CLAUDE_FLOW_CWD`). Register per-workspace, not globally, so each repo gets its own memory.
- Smoke test: `node scripts/mcp-smoke.mjs` — initialize → tools/list ≥250 → memory_store → memory_search round-trip (8 checks, all passing locally).

## Context-bloat mitigation (350 tools is too many to advertise wholesale)

1. **Per-agent tool allowlists** (primary) — `templates/tool-profiles.json` defines role profiles (core ~75, worker ~35, researcher ~45, neural ~40); the M2 converter emits per-agent `allowedTools`/`tools` from these.
2. `kiro-flow mcp-proxy` stdio filter — only if Kiro turns out to advertise all server tools regardless of agent allowlists (open unknown #4).
3. Kiro Powers keyword-triggered loading (M10).
4. Upstream PR: env-gated category filter in `registerTools()`.

## Registration

- **Kiro CLI (workspace):** copy `packages/kiro-flow/templates/mcp.json` to the repo root as `mcp.json`, or run
  `kiro-cli mcp add --name claude-flow --command npx --args "-y,ruflo,mcp,start"`
- **Kiro IDE:** same server block in `.kiro/settings/mcp.json`.

## Work-side verification checklist (run on the Kiro laptop)

```bash
# 1. Register (in a scratch repo)
kiro-cli mcp add --name claude-flow --command npx --args "-y,ruflo,mcp,start"
kiro-cli mcp status --name claude-flow          # expect: connected, ~350 tools

# 2. Interactive check (IDE or kiro-cli chat)
#    Prompt: "Use the claude-flow memory_store tool to save key=hello value=kiro,
#             then memory_search for 'hello'."
#    Expect mcp__claude-flow__memory_store + memory_search tool calls.

# 3. Persistence check
npx -y ruflo memory search hello                # row visible in .swarm/memory.db

# 4. Headless check (also answers open unknown #2 — SSO vs KIRO_API_KEY)
kiro-cli chat --no-interactive --trust-all-tools \
  "Store key=headless value=works via claude-flow memory_store, then search for it"
#    If this errors on auth: headless needs an issued KIRO_API_KEY → interactive-only
#    mode until resolved. Record the exact error in dossiers/00 open unknowns.
```

Demo line for the employer: *“We just gave Kiro 350 new tools — hybrid vector+keyword memory, swarm coordination, background workers — with zero custom code.”*
