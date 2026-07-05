/** M9 tests: command runner resolution/substitution/kiroification + kf-deep-researcher. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { buildCmdPrompt, listCommands, resolveCommand, CURATED } from '../src/cmd.mjs';
import { buildDeepResearcherAgent } from '../src/init.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = join(here, '..', '..', '..', 'schemas', 'kiro-agent.schema.json');
const E2E_WORKSPACE = join(here, '..', '..', '..', 'test-workspace', 'm3-e2e');
const hasBundle = existsSync(join(E2E_WORKSPACE, '.claude', 'commands'));

function makeCmdDir() {
  const dir = mkdtempSync(join(tmpdir(), 'kf-m9-'));
  mkdirSync(join(dir, '.claude', 'commands', 'swarm'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'commands', 'sparc'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'commands', 'swarm', 'research.md'),
    '---\nname: research\n---\nResearch $ARGUMENTS using mcp__claude-flow__memory_search.\n');
  writeFileSync(join(dir, '.claude', 'commands', 'sparc', 'research.md'), 'sparc research\n');
  writeFileSync(join(dir, '.claude', 'commands', 'swarm', 'unique.md'), 'no placeholder here\n');
  return dir;
}

test('resolveCommand: exact id, unambiguous bare name, ambiguity, suggestions', () => {
  const dir = makeCmdDir();
  try {
    assert.match(resolveCommand(dir, 'swarm/research').path, /swarm\/research\.md$/);
    assert.match(resolveCommand(dir, 'unique').path, /swarm\/unique\.md$/);
    const amb = resolveCommand(dir, 'research');
    assert.match(amb.error, /ambiguous/);
    assert.deepEqual(amb.candidates.sort(), ['sparc/research', 'swarm/research']);
    const unk = resolveCommand(dir, 'resear');
    assert.match(unk.error, /unknown/);
    assert.ok(unk.candidates.includes('swarm/research'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('buildCmdPrompt: strips frontmatter, substitutes $ARGUMENTS, kiroifies', () => {
  const dir = makeCmdDir();
  try {
    const raw = readFileSync(join(dir, '.claude', 'commands', 'swarm', 'research.md'), 'utf8');
    const out = buildCmdPrompt(raw, ['rust', 'async runtimes']);
    assert.ok(!out.includes('---'), 'frontmatter stripped');
    assert.match(out, /Research rust async runtimes/);
    assert.match(out, /using memory_search/, 'mcp prefix kiroified');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('buildCmdPrompt: no $ARGUMENTS marker → args appended as a section', () => {
  const out = buildCmdPrompt('do the task\n', ['extra', 'context']);
  assert.match(out, /## Arguments\n\nextra context/);
  assert.equal(buildCmdPrompt('do the task\n', []), 'do the task\n');
});

test('bundle: every curated command resolves in the real installed set', { skip: !hasBundle }, () => {
  const ids = new Set(listCommands(E2E_WORKSPACE).map((c) => c.id));
  for (const [id] of CURATED) assert.ok(ids.has(id), `curated ${id} missing from bundle`);
  assert.ok(ids.size >= 150, `expected ~166 commands, got ${ids.size}`);
});

test('kf-deep-researcher: schema-valid, web tools + memory_store, hooks', () => {
  const agent = buildDeepResearcherAgent();
  const ajv = new Ajv2020({ strict: false });
  const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA, 'utf8')));
  assert.ok(validate(agent), JSON.stringify(validate.errors));
  for (const t of ['web_search', 'web_fetch', '@claude-flow/memory_store', '@claude-flow/memory_search']) {
    assert.ok(agent.tools.includes(t), `missing ${t}`);
  }
  assert.ok(agent.allowedTools.includes('web_search'), 'web_search must be pre-trusted');
  assert.ok(!agent.tools.includes('shell'), 'researcher needs no shell');
  assert.ok(agent.hooks);
});
