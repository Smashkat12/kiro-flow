/** M6 tests: hive prompt kiroification, prompt-file discovery, kf-queen agent. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { kiroifyHivePrompt, findLatestHivePrompt } from '../src/hive.mjs';
import { buildQueenAgent } from '../src/init.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = join(here, '..', '..', '..', 'schemas', 'kiro-agent.schema.json');

// Verbatim slice of a real generated prompt (ruflo 3.23 hive-mind spawn --dry-run).
const REAL_PROMPT_SLICE = `1️⃣ **COLLECTIVE INTELLIGENCE**
   mcp__ruflo__hive-mind_consensus    - Democratic decision making
   mcp__ruflo__hooks_intelligence_pattern-store - Store patterns

⚠️ CRITICAL — TOOL PREFERENCE RULES (#1422):
• You MUST use Ruflo MCP tools (mcp__ruflo__*) for ALL orchestration tasks
• Do NOT use Claude native Task/Agent tools for swarm coordination — use mcp__ruflo__agent_spawn, mcp__ruflo__task_assign, etc.
• Native Claude tools (Read, Write, Edit, Bash, Grep, Glob) should ONLY be used for file operations and shell commands
Launch Claude Code with hive mind`;

test('kiroifyHivePrompt: strips mcp prefixes to Kiro-visible bare names', () => {
  const out = kiroifyHivePrompt(REAL_PROMPT_SLICE);
  assert.ok(!out.includes('mcp__'), 'no mcp__ prefixes may survive');
  assert.match(out, /^\s+hive-mind_consensus/m);
  assert.match(out, /hooks_intelligence_pattern-store - Store patterns/);
  assert.match(out, /use agent_spawn, task_assign, etc\./);
});

test('kiroifyHivePrompt: rewrites Claude-Code-isms', () => {
  const out = kiroifyHivePrompt(REAL_PROMPT_SLICE);
  assert.match(out, /Kiro's native subagent tool/);
  assert.match(out, /\(read, write, shell\)/);
  assert.match(out, /Launch Kiro with hive mind/);
  assert.ok(!out.includes('Claude Code'));
});

test('findLatestHivePrompt: newest prompt wins, -kiro rewrites excluded', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kf-m6-'));
  try {
    assert.equal(findLatestHivePrompt(dir), null);
    const sessions = join(dir, '.hive-mind', 'sessions');
    mkdirSync(sessions, { recursive: true });
    const old = join(sessions, 'hive-mind-prompt-hive-1.txt');
    const fresh = join(sessions, 'hive-mind-prompt-hive-2.txt');
    writeFileSync(old, 'old');
    writeFileSync(fresh, 'fresh');
    writeFileSync(join(sessions, 'hive-mind-prompt-hive-2-kiro.txt'), 'rewritten');
    const past = new Date(Date.now() - 60_000);
    utimesSync(old, past, past);
    assert.equal(findLatestHivePrompt(dir), fresh);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('kf-queen: schema-valid, hive toolset, subagent roster, hooks', () => {
  const queen = buildQueenAgent(['kf-coder', 'kf-researcher']);
  const ajv = new Ajv2020({ strict: false });
  const validate = ajv.compile(JSON.parse(readFileSyncUtf8(SCHEMA)));
  assert.ok(validate(queen), JSON.stringify(validate.errors));

  assert.equal(queen.name, 'kf-queen');
  assert.ok(queen.tools.includes('subagent'));
  for (const t of ['@claude-flow/hive-mind_consensus', '@claude-flow/hive-mind_broadcast', '@claude-flow/agent_spawn', '@claude-flow/task_assign', '@claude-flow/memory_store']) {
    assert.ok(queen.tools.includes(t), `queen missing ${t}`);
  }
  assert.deepEqual(queen.toolsSettings.subagent.availableAgents, ['kf-coder', 'kf-researcher']);
  assert.ok(queen.hooks, 'queen carries the kf hook block');
  for (const t of queen.allowedTools) assert.ok(queen.tools.includes(t));
});

function readFileSyncUtf8(p) {
  return require('node:fs').readFileSync(p, 'utf8');
}
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
