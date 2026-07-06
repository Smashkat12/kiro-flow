/** M7 tests: recall scoring/injection, session bridge, session join. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinSessions, RECALL_CACHE_REL, SESSIONS_BRIDGE_REL } from '../src/session.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ADAPTER = join(here, '..', 'templates', 'kiro-hook-adapter.cjs');
const require = createRequire(import.meta.url);
const { scoreMemoryEntries, formatRecallBlock, RECALL_CACHE_REL: ADAPTER_CACHE_REL, SESSIONS_REL: ADAPTER_SESSIONS_REL } = require(ADAPTER);

const ENTRIES = [
  { key: 'db-choice', namespace: 'decisions', value: 'We decided to use PostgreSQL 16 with pgvector for embeddings', updatedAt: String(Date.now()) },
  { key: 'lint-fix', namespace: 'solutions', value: 'eslint flat config needs the compat shim', updatedAt: '1000' },
  { key: 'unrelated', namespace: 'default', value: 'the quarterly report template lives in docs/', updatedAt: '1000' },
];

test('adapter and session.mjs agree on the bridge/cache paths', () => {
  assert.equal(join(...ADAPTER_CACHE_REL), RECALL_CACHE_REL);
  assert.equal(join(...ADAPTER_SESSIONS_REL), SESSIONS_BRIDGE_REL);
});

test('scoreMemoryEntries: prompt-relevant entry wins, unrelated filtered out', () => {
  const scored = scoreMemoryEntries(ENTRIES, 'what database did we pick for embeddings?');
  assert.equal(scored[0].entry.key, 'db-choice');
  assert.ok(!scored.some((s) => s.entry.key === 'unrelated'));
});

test('scoreMemoryEntries: empty prompt falls back to namespace/recency ranking', () => {
  const scored = scoreMemoryEntries(ENTRIES, '');
  assert.ok(scored.length >= 2);
  assert.equal(scored[0].entry.key, 'db-choice'); // decisions + recent
});

test('formatRecallBlock: compact, capped, namespace-tagged', () => {
  const block = formatRecallBlock(scoreMemoryEntries(ENTRIES, 'database embeddings'), 1);
  assert.match(block, /\[kiro-flow recall\]/);
  assert.match(block, /\[decisions\] db-choice: We decided to use PostgreSQL 16/);
  assert.equal(block.trim().split('\n').length, 2); // header + 1 entry
});

function runAdapter(cwd, specs, payload, env = {}) {
  return spawnSync(process.execPath, [ADAPTER, ...specs], {
    cwd, input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('memory-inject (process): cache hit prints the recall block into stdout', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kf-m7-'));
  try {
    const cache = join(dir, RECALL_CACHE_REL);
    mkdirSync(dirname(cache), { recursive: true });
    writeFileSync(cache, JSON.stringify({ count: ENTRIES.length, entries: ENTRIES }));
    const res = runAdapter(dir, ['memory-inject'],
      { hook_event_name: 'sessionStart', cwd: dir, prompt: 'which database did we pick for embeddings?' },
      { KIRO_FLOW_RECALL_TTL_MS: String(10 ** 12) }); // fresh — no detached refresh
    assert.equal(res.status, 0);
    assert.match(res.stdout, /db-choice: We decided to use PostgreSQL 16/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('memory-inject (process): no cache → silent success, never blocks the agent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kf-m7-nocache-'));
  try {
    const res = runAdapter(dir, ['memory-inject'],
      { hook_event_name: 'sessionStart', cwd: dir, prompt: 'anything' },
      { KIRO_FLOW_RUFLO_SPEC: 'definitely-not-a-package' }); // refresh must fail open too
    assert.equal(res.status, 0);
    assert.equal(res.stdout, '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('session-bridge (process): sessionStart records, stop updates the same id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kf-m7-bridge-'));
  try {
    const env = { KIRO_SESSION_ID: 'kiro-sess-42' };
    let res = runAdapter(dir, ['session-bridge'],
      { hook_event_name: 'sessionStart', cwd: dir, prompt: 'build the thing' }, env);
    assert.equal(res.status, 0);
    res = runAdapter(dir, ['session-bridge'],
      { hook_event_name: 'stop', cwd: dir, assistant_response: 'the thing is built' }, env);
    assert.equal(res.status, 0);

    const store = JSON.parse(readFileSync(join(dir, SESSIONS_BRIDGE_REL), 'utf8'));
    const s = store.sessions['kiro-sess-42'];
    assert.equal(s.promptHead, 'build the thing');
    assert.equal(s.lastResponseHead, 'the thing is built');
    assert.ok(s.firstSeen <= s.lastSeen);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('joinSessions: merges kiro list with bridge, bridge-only ids kept, newest first', () => {
  const rows = joinSessions(
    [{ session_id: 'a', updated_at: '2026-07-05T10:00:00Z', first_message: 'hi' }],
    {
      a: { lastSeen: '2026-07-05T10:01:00Z', promptHead: 'hi there' },
      b: { lastSeen: '2026-07-05T12:00:00Z', promptHead: 'later session' },
    },
  );
  assert.deepEqual(rows.map((r) => r.id), ['b', 'a']);
  assert.equal(rows[1].prompt, 'hi there'); // bridge beats kiro's summary
  assert.ok(rows.every((r) => r.hooked));
});
