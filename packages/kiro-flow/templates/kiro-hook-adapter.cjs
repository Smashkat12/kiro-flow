#!/usr/bin/env node
/**
 * kiro-hook-adapter — bridges Kiro agent hooks to ruflo's Claude Code hook
 * handlers, so the unmodified `.claude/helpers/` kernel (hook-handler.cjs,
 * auto-memory-hook.mjs) runs behind Kiro.
 *
 * Usage (in .kiro/agents/*.json hooks):
 *   node .kiro/kiro-flow/kiro-hook-adapter.cjs <spec> [<spec> ...]
 * where <spec> is one of
 *   <cmd>              → node .claude/helpers/hook-handler.cjs <cmd>
 *   auto-memory:<cmd>  → node .claude/helpers/auto-memory-hook.mjs <cmd>
 *   memory-inject      → (built-in, M7) print top-k relevant memories from the
 *                        recall cache to stdout — Kiro injects it into context
 *   memory-refresh     → (built-in, M7) detached `ruflo memory export` refresh
 *                        of the recall cache (never blocks the hook)
 *   session-bridge     → (built-in, M7) record KIRO_SESSION_ID ↔ workspace
 *                        session activity in .claude-flow/kiro-flow/kiro-sessions.json
 *
 * Contract (both sides verified empirically, kiro-cli 2.10.0 — dossier 04):
 *   in : Kiro hook JSON on stdin {hook_event_name, cwd, tool_name, tool_input,
 *        tool_response?, prompt?, assistant_response?}
 *   out: handler stdout is forwarded (Kiro injects it into model context);
 *        any handler exiting non-zero → adapter exits 2, which makes Kiro
 *        block the tool (preToolUse) with our stderr as the reason.
 *   Fail-open everywhere else: a missing/broken/timed-out handler must never
 *   wedge the agent, so those paths exit 0.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { dirname, join } = require('node:path');

const TIMEOUT_MS = Number(process.env.KIRO_FLOW_HOOK_TIMEOUT_MS || 8000);

// ── Kiro → Claude Code translation ─────────────────────────────────────────

const EVENT_MAP = {
  agentSpawn: 'SessionStart',
  userPromptSubmit: 'UserPromptSubmit',
  preToolUse: 'PreToolUse',
  postToolUse: 'PostToolUse',
  stop: 'Stop',
};

/** fs_write is Kiro's whole write/edit surface; split it the way CC names it. */
function mapFsWrite(input) {
  const sub = (input && input.command) || '';
  if (sub === 'create') {
    return { name: 'Write', input: { file_path: input.path, content: input.file_text ?? '' } };
  }
  if (sub === 'str_replace' || sub === 'strReplace') {
    return {
      name: 'Edit',
      input: { file_path: input.path, old_string: input.old_str ?? '', new_string: input.new_str ?? '' },
    };
  }
  // insert / append / anything future — an edit as far as ruflo cares
  return { name: 'Edit', input: { file_path: input.path } };
}

function mapTool(toolName, toolInput) {
  const input = toolInput || {};
  if (toolName === 'execute_bash') return { name: 'Bash', input: { command: input.command ?? '' } };
  if (toolName === 'fs_write') return mapFsWrite(input);
  if (toolName === 'fs_read') {
    const op = Array.isArray(input.operations) ? input.operations[0] : undefined;
    return { name: 'Read', input: { file_path: (op && op.path) ?? input.path ?? '' } };
  }
  // MCP tools: @server/tool → mcp__server__tool (CC naming)
  const mcp = /^@([^/]+)\/(.+)$/.exec(toolName);
  if (mcp) return { name: `mcp__${mcp[1]}__${mcp[2]}`, input };
  return { name: toolName, input }; // use_aws, unknown future tools: pass through
}

/** Kiro's execute_bash reports exit_status as a string; CC handlers expect a number. */
function mapToolResponse(tr) {
  if (tr == null || typeof tr !== 'object') return tr;
  const out = { ...tr };
  const first = Array.isArray(tr.result) ? tr.result[0] : undefined;
  if (first && typeof first === 'object' && first.exit_status != null) {
    const code = Number(first.exit_status);
    if (!Number.isNaN(code)) out.exit_code = code;
  }
  return out;
}

/** Translate one Kiro hook stdin payload into the CC-shaped payload ruflo reads. */
function translate(kiro) {
  const out = {
    hook_event_name: EVENT_MAP[kiro.hook_event_name] ?? kiro.hook_event_name,
    cwd: kiro.cwd ?? process.cwd(),
    session_id: process.env.KIRO_SESSION_ID ?? '',
  };
  if (kiro.prompt != null) out.prompt = kiro.prompt;
  if (kiro.assistant_response != null) out.assistant_response = kiro.assistant_response;
  if (kiro.tool_name != null) {
    const mapped = mapTool(kiro.tool_name, kiro.tool_input);
    out.tool_name = mapped.name;
    out.tool_input = mapped.input;
    out.kiro_tool_name = kiro.tool_name; // keep the original for diagnostics
  }
  if (kiro.tool_response != null) out.tool_response = mapToolResponse(kiro.tool_response);
  return out;
}

// ── M7 built-ins: ambient memory + session bridge ───────────────────────────

const RECALL_CACHE_REL = ['.claude-flow', 'kiro-flow', 'recall-cache.json'];
const SESSIONS_REL = ['.claude-flow', 'kiro-flow', 'kiro-sessions.json'];
const RUFLO_SPEC_DEFAULT = 'ruflo@~3.23.0';

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'what', 'which', 'did', 'does', 'have', 'has', 'you', 'your', 'our', 'use', 'using', 'into', 'about', 'then', 'than']);

function tokenize(text) {
  return [...new Set(String(text).toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) ?? [])]
    .filter((t) => !STOPWORDS.has(t));
}

/**
 * Rank cache entries against the spawn prompt. Cheap lexical scoring — the
 * point is "surface the obviously relevant decisions/patterns in <10ms",
 * not to compete with the HNSW search that built the cache.
 */
function scoreMemoryEntries(entries, prompt, now = Date.now()) {
  const promptTokens = tokenize(prompt);
  const WEEK = 7 * 24 * 3600 * 1000;
  return entries
    .map((e) => {
      const text = `${e.key ?? ''} ${e.value ?? ''} ${e.namespace ?? ''}`;
      const tokens = new Set(tokenize(text));
      const overlap = promptTokens.filter((t) => tokens.has(t)).length;
      let score = promptTokens.length ? overlap / Math.sqrt(promptTokens.length) : 0;
      if (['decisions', 'patterns', 'solutions'].includes(e.namespace)) score += 0.3;
      const updated = Number(e.updatedAt ?? e.createdAt ?? 0);
      if (updated && now - updated < WEEK) score += 0.2;
      return { entry: e, score, overlap };
    })
    // With a prompt, require an actual token match; without one (bare spawn),
    // fall back to namespace/recency ranking so the block is still useful.
    .filter((s) => (promptTokens.length ? s.overlap > 0 : s.score > 0))
    .sort((a, b) => b.score - a.score);
}

function formatRecallBlock(scored, topK) {
  if (!scored.length) return '';
  const lines = scored.slice(0, topK).map(({ entry }) => {
    const value = String(entry.value ?? '').replace(/\s+/g, ' ').slice(0, 240);
    return `- [${entry.namespace ?? 'default'}] ${entry.key}: ${value}`;
  });
  return `[kiro-flow recall] Relevant memories from earlier sessions (claude-flow memory):\n${lines.join('\n')}\n`;
}

/** Detached, fail-open recall-cache refresh — the slow CLI never blocks a hook. */
function refreshRecallCache(cwd, { sync = false } = {}) {
  const { spawn } = require('node:child_process');
  const { mkdirSync } = require('node:fs');
  const cachePath = join(cwd, ...RECALL_CACHE_REL);
  try { mkdirSync(dirname(cachePath), { recursive: true }); } catch { /* fail-open */ }
  const spec = process.env.KIRO_FLOW_RUFLO_SPEC || RUFLO_SPEC_DEFAULT;
  const args = ['-y', spec, 'memory', 'export', '-o', cachePath, '-f', 'json'];
  if (sync) {
    const res = spawnSync('npx', args, { cwd, stdio: 'ignore', timeout: 180_000 });
    return res.status === 0;
  }
  try {
    const child = spawn('npx', args, { cwd, stdio: 'ignore', detached: true });
    child.unref();
  } catch { /* fail-open */ }
  return true;
}

function builtinMemoryInject(kiro, cwd) {
  const { readFileSync: read, statSync } = require('node:fs');
  const cachePath = join(cwd, ...RECALL_CACHE_REL);
  const ttlMs = Number(process.env.KIRO_FLOW_RECALL_TTL_MS || 15 * 60 * 1000);
  const topK = Number(process.env.KIRO_FLOW_RECALL_TOPK || 5);
  let entries = [];
  let stale = true;
  try {
    entries = JSON.parse(read(cachePath, 'utf8')).entries ?? [];
    stale = Date.now() - statSync(cachePath).mtimeMs > ttlMs;
  } catch { /* no cache yet */ }
  if (stale) refreshRecallCache(cwd); // detached; benefits the NEXT spawn
  if (!entries.length) return { ok: true, stdout: '', stderr: '' };
  const block = formatRecallBlock(scoreMemoryEntries(entries, kiro.prompt ?? ''), topK);
  return { ok: true, stdout: block, stderr: '' };
}

function builtinSessionBridge(kiro, cwd) {
  const sid = process.env.KIRO_SESSION_ID;
  if (!sid) return { ok: true, stdout: '', stderr: '' };
  const { mkdirSync, readFileSync: read, writeFileSync } = require('node:fs');
  const file = join(cwd, ...SESSIONS_REL);
  let store = { sessions: {} };
  try { store = JSON.parse(read(file, 'utf8')); } catch { /* first write */ }
  const now = new Date().toISOString();
  const s = store.sessions[sid] ?? { firstSeen: now, cwd };
  s.lastSeen = now;
  if (kiro.hook_event_name === 'agentSpawn' && kiro.prompt != null) {
    s.promptHead = String(kiro.prompt).slice(0, 160);
  }
  if (kiro.hook_event_name === 'stop' && kiro.assistant_response != null) {
    s.lastResponseHead = String(kiro.assistant_response).slice(0, 160);
  }
  store.sessions[sid] = s;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(store, null, 2) + '\n');
  } catch { /* fail-open */ }
  return { ok: true, stdout: '', stderr: '' };
}

const BUILTINS = {
  'memory-inject': builtinMemoryInject,
  'memory-refresh': (kiro, cwd) => { refreshRecallCache(cwd); return { ok: true, stdout: '', stderr: '' }; },
  'session-bridge': builtinSessionBridge,
};

// ── handler resolution + dispatch ───────────────────────────────────────────

const HANDLER_FILES = {
  handler: join('.claude', 'helpers', 'hook-handler.cjs'),
  'auto-memory': join('.claude', 'helpers', 'auto-memory-hook.mjs'),
};

/** Walk up from cwd to find .claude/helpers/<file>; fall back to $HOME. */
function resolveHelper(kind, startDir) {
  const rel = HANDLER_FILES[kind];
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, rel);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const fallback = home && join(home, rel);
  return fallback && existsSync(fallback) ? fallback : null;
}

function parseSpec(spec) {
  return spec.startsWith('auto-memory:')
    ? { kind: 'auto-memory', cmd: spec.slice('auto-memory:'.length) }
    : { kind: 'handler', cmd: spec };
}

function runSpec(spec, ccPayload, cwd) {
  const { kind, cmd } = parseSpec(spec);
  const script = resolveHelper(kind, cwd);
  if (!script) return { ok: true, stdout: '', stderr: `[kiro-flow] ${HANDLER_FILES[kind]} not found, skipping ${spec}\n` };
  const res = spawnSync(process.execPath, [script, cmd], {
    cwd,
    input: JSON.stringify(ccPayload),
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    env: process.env,
  });
  if (res.error) {
    const timedOut = res.error.code === 'ETIMEDOUT';
    return { ok: true, stdout: res.stdout || '', stderr: `[kiro-flow] ${spec} ${timedOut ? `timed out after ${TIMEOUT_MS}ms` : `failed: ${res.error.message}`}, skipping\n` };
  }
  return { ok: res.status === 0, status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function main() {
  const specs = process.argv.slice(2);
  if (specs.length === 0) {
    process.stderr.write('usage: kiro-hook-adapter.cjs <handler-cmd|auto-memory:<cmd>> [...]\n');
    process.exit(0); // fail-open: a miswired hook must not block the agent
  }

  let raw = '';
  try { raw = require('node:fs').readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  let kiro = {};
  if (raw.trim()) {
    try { kiro = JSON.parse(raw); } catch { /* fail-open on malformed stdin */ }
  }
  const cwd = kiro.cwd ?? process.cwd();
  const ccPayload = translate(kiro);

  for (const spec of specs) {
    let res;
    if (BUILTINS[spec]) {
      try { res = BUILTINS[spec](kiro, cwd); }
      catch (e) { res = { ok: true, stdout: '', stderr: `[kiro-flow] builtin ${spec} failed: ${e.message}\n` }; }
    } else {
      res = runSpec(spec, ccPayload, cwd);
    }
    if (res.stdout) process.stdout.write(res.stdout);
    if (!res.ok) {
      // exit 2 = block signal to Kiro; stderr becomes the reason shown to the model
      process.stderr.write(res.stderr || res.stdout || `${spec} rejected (exit ${res.status})`);
      process.exit(2);
    }
    if (res.stderr) process.stderr.write(res.stderr);
  }
  process.exit(0);
}

module.exports = {
  translate, mapTool, mapToolResponse, resolveHelper, EVENT_MAP,
  scoreMemoryEntries, formatRecallBlock, tokenize, refreshRecallCache,
  RECALL_CACHE_REL, SESSIONS_REL,
};
if (require.main === module) main();
