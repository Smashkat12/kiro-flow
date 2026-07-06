/**
 * M4 tests: kiro-hook-adapter translation (against real captured kiro-cli
 * 2.10.0 payloads in fixtures/kiro-hook-captures.ndjson), adapter process
 * behavior (stdout passthrough, block-on-nonzero, fail-open), and hook
 * injection by the converter.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildKfHooks, convertAgents, HOOK_ADAPTER_REL } from '../src/convert/agents.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ADAPTER = join(here, '..', 'templates', 'kiro-hook-adapter.cjs');
const require = createRequire(import.meta.url);
const { translate, EVENT_MAP } = require(ADAPTER);

const captures = readFileSync(join(here, 'fixtures', 'kiro-hook-captures.ndjson'), 'utf8')
  .trim().split('\n').map((l) => JSON.parse(l).stdin);
const byTool = (event, tool) => captures.find((c) => c.hook_event_name === event && c.tool_name === tool);

// ── translation, driven by real captured payloads ───────────────────────────

test('translate: event names map to Claude Code casing', () => {
  for (const c of captures) {
    assert.equal(translate(c).hook_event_name, EVENT_MAP[c.hook_event_name]);
  }
});

test('translate: fs_write create → Write with file_path/content', () => {
  const cc = translate(byTool('preToolUse', 'fs_write'));
  assert.equal(cc.tool_name, 'Write');
  assert.match(cc.tool_input.file_path, /hello\.txt$/);
  assert.equal(cc.tool_input.content, 'hi');
  assert.equal(cc.kiro_tool_name, 'fs_write');
});

test('translate: fs_write str_replace → Edit with old/new strings', () => {
  const cc = translate({
    hook_event_name: 'preToolUse',
    cwd: '/w',
    tool_name: 'fs_write',
    tool_input: { command: 'str_replace', path: '/w/a.js', old_str: 'x', new_str: 'y' },
  });
  assert.equal(cc.tool_name, 'Edit');
  assert.deepEqual(cc.tool_input, { file_path: '/w/a.js', old_string: 'x', new_string: 'y' });
});

test('translate: execute_bash → Bash with command', () => {
  const cc = translate(byTool('preToolUse', 'execute_bash'));
  assert.equal(cc.tool_name, 'Bash');
  assert.equal(cc.tool_input.command, 'date +%s');
});

test('translate: fs_read operations → Read with file_path', () => {
  const cc = translate(byTool('preToolUse', 'fs_read'));
  assert.equal(cc.tool_name, 'Read');
  assert.match(cc.tool_input.file_path, /hello\.txt$/);
});

test('translate: MCP tool @server/name → mcp__server__name, input passes through', () => {
  const kiro = byTool('preToolUse', '@claude-flow/memory_store');
  const cc = translate(kiro);
  assert.equal(cc.tool_name, 'mcp__claude-flow__memory_store');
  assert.deepEqual(cc.tool_input, kiro.tool_input);
});

test('translate: execute_bash tool_response gains numeric exit_code', () => {
  const cc = translate(byTool('postToolUse', 'execute_bash'));
  assert.equal(cc.tool_response.exit_code, 0);
  assert.equal(cc.tool_response.success, true);
});

test('translate: prompt and assistant_response pass through', () => {
  const spawn = captures.find((c) => c.hook_event_name === 'sessionStart');
  assert.equal(translate(spawn).hook_event_name, 'SessionStart');
  assert.equal(translate(spawn).prompt, spawn.prompt);
  const stop = captures.find((c) => c.hook_event_name === 'stop');
  assert.equal(translate(stop).assistant_response, stop.assistant_response);
});

// ── adapter process behavior against a stub handler kernel ─────────────────

const STUB_HANDLER = `#!/usr/bin/env node
const cmd = process.argv[2];
let raw = ''; try { raw = require('node:fs').readFileSync(0, 'utf8'); } catch {}
if (cmd === 'echo') { console.log('HANDLER-SAW:' + raw.trim()); process.exit(0); }
if (cmd === 'reject') { console.error('nope: policy violation'); process.exit(1); }
if (cmd === 'hang') { setTimeout(() => {}, 60000); }
console.log('[OK] Hook: ' + cmd);
`;

function makeSite() {
  const dir = mkdtempSync(join(tmpdir(), 'kf-m4-'));
  mkdirSync(join(dir, '.claude', 'helpers'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'helpers', 'hook-handler.cjs'), STUB_HANDLER);
  writeFileSync(join(dir, '.claude', 'helpers', 'auto-memory-hook.mjs'),
    `console.log('AUTO-MEMORY:' + process.argv[2]);`);
  return dir;
}

function runAdapter(cwd, specs, payload, env = {}) {
  return spawnSync(process.execPath, [ADAPTER, ...specs], {
    cwd,
    input: JSON.stringify({ hook_event_name: 'preToolUse', cwd, ...payload }),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('adapter: forwards handler stdout, translated payload on handler stdin, exit 0', () => {
  const dir = makeSite();
  try {
    const res = runAdapter(dir, ['echo'], { tool_name: 'execute_bash', tool_input: { command: 'ls' } });
    assert.equal(res.status, 0);
    const seen = JSON.parse(res.stdout.replace('HANDLER-SAW:', ''));
    assert.equal(seen.hook_event_name, 'PreToolUse');
    assert.equal(seen.tool_name, 'Bash');
    assert.equal(seen.tool_input.command, 'ls');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('adapter: handler non-zero exit → exit 2 with stderr as reason (Kiro block signal)', () => {
  const dir = makeSite();
  try {
    const res = runAdapter(dir, ['reject'], { tool_name: 'execute_bash', tool_input: { command: 'rm -rf /' } });
    assert.equal(res.status, 2);
    assert.match(res.stderr, /policy violation/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('adapter: runs multiple specs in order, auto-memory: prefix routes to the mjs helper', () => {
  const dir = makeSite();
  try {
    const res = runAdapter(dir, ['session-end', 'auto-memory:sync'], {});
    assert.equal(res.status, 0);
    assert.match(res.stdout, /\[OK\] Hook: session-end[\s\S]*AUTO-MEMORY:sync/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('adapter: fail-open — missing helpers exit 0, handler timeout exits 0', () => {
  const bare = mkdtempSync(join(tmpdir(), 'kf-m4-bare-'));
  try {
    const res = runAdapter(bare, ['pre-bash'], {}, { HOME: bare });
    assert.equal(res.status, 0);
    assert.match(res.stderr, /not found, skipping/);
  } finally { rmSync(bare, { recursive: true, force: true }); }

  const dir = makeSite();
  try {
    const res = runAdapter(dir, ['hang'], {}, { KIRO_FLOW_HOOK_TIMEOUT_MS: '300' });
    assert.equal(res.status, 0);
    assert.match(res.stderr, /timed out/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('adapter: malformed stdin is fail-open, still dispatches', () => {
  const dir = makeSite();
  try {
    const res = spawnSync(process.execPath, [ADAPTER, 'echo'], { cwd: dir, input: '{not json', encoding: 'utf8' });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /HANDLER-SAW:/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── converter injection ─────────────────────────────────────────────────────

function makePersonaDir() {
  const dir = mkdtempSync(join(tmpdir(), 'kf-m4-personas-'));
  mkdirSync(join(dir, 'core'), { recursive: true });
  writeFileSync(join(dir, 'core', 'coder.md'),
    '---\nname: coder\ndescription: writes code\n---\n\nYou are a coder.\n');
  return dir;
}

test('convert: injects the kf hook block by default, --no-hooks omits it', () => {
  const src = makePersonaDir();
  try {
    const { agents } = convertAgents({ source: src, out: join(src, 'out'), write: false });
    assert.deepEqual(agents[0].json.hooks, buildKfHooks());
    const preMatchers = agents[0].json.hooks.preToolUse.map((h) => h.matcher);
    assert.deepEqual(preMatchers, ['execute_bash', 'fs_write']);
    for (const list of Object.values(agents[0].json.hooks)) {
      for (const h of list) assert.match(h.command, new RegExp(`node ${HOOK_ADAPTER_REL}`));
    }

    const bare = convertAgents({ source: src, out: join(src, 'out2'), write: false, hooks: false });
    assert.equal(bare.agents[0].json.hooks, undefined);
  } finally { rmSync(src, { recursive: true, force: true }); }
});
