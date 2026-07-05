/**
 * M2 converter tests. The reference corpus (reference/ruflo/.claude/agents,
 * ruflo v3.23.0, 108 files) is the fixture; golden files in test/golden/ are
 * full expected outputs for representative agents.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parseFrontmatter, parseToolList } from '../src/convert/frontmatter.mjs';
import { mapToolName } from '../src/convert/tool-map.mjs';
import { convertAgents, expandProfile } from '../src/convert/agents.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const CORPUS = join(repoRoot, 'reference', 'ruflo', '.claude', 'agents');
const SCHEMA = join(repoRoot, 'schemas', 'kiro-agent.schema.json');
const hasCorpus = existsSync(CORPUS);

// ── frontmatter ──

test('frontmatter: plain scalars', () => {
  const { attrs, body, hasFrontmatter } = parseFrontmatter('---\nname: coder\ndescription: writes code\n---\n\n# Body\n');
  assert.equal(hasFrontmatter, true);
  assert.equal(attrs.name, 'coder');
  assert.equal(attrs.description, 'writes code');
  assert.equal(body, '# Body\n');
});

test('frontmatter: block scalar description + tools line', () => {
  const text = '---\nname: pr\ndescription: |\n  Line one\n  line two\ntools: Bash, Read, mcp__claude-flow__swarm_init\n---\nbody';
  const { attrs } = parseFrontmatter(text);
  assert.equal(attrs.description, 'Line one\nline two');
  assert.deepEqual(parseToolList(attrs.tools), ['Bash', 'Read', 'mcp__claude-flow__swarm_init']);
});

test('frontmatter: no fence → body passthrough', () => {
  const { attrs, hasFrontmatter, body } = parseFrontmatter('# Just a doc\n');
  assert.equal(hasFrontmatter, false);
  assert.deepEqual(attrs, {});
  assert.equal(body, '# Just a doc\n');
});

// ── tool mapping ──

const LIVE = new Set(['swarm_init', 'task_create', 'memory_store', 'memory_retrieve', 'memory_search', 'performance_bottleneck', 'github_pr_manage']);

test('mapToolName: builtins', () => {
  assert.deepEqual(mapToolName('Bash', LIVE).refs, ['shell']);
  assert.deepEqual(mapToolName('Read', LIVE).refs, ['read']);
  assert.deepEqual(mapToolName('Grep', LIVE).refs, ['read']);
  assert.deepEqual(mapToolName('MultiEdit', LIVE).refs, ['write']);
  assert.deepEqual(mapToolName('Task', LIVE).refs, ['subagent']);
  assert.equal(mapToolName('TodoWrite', LIVE).kind, 'dropped');
});

test('mapToolName: live claude-flow tool passes through', () => {
  assert.deepEqual(mapToolName('mcp__claude-flow__swarm_init', LIVE), { refs: ['@claude-flow/swarm_init'], kind: 'claude-flow' });
});

test('mapToolName: v2→v3 renames', () => {
  assert.deepEqual(mapToolName('mcp__claude-flow__task_orchestrate', LIVE).refs, ['@claude-flow/task_create']);
  assert.deepEqual(mapToolName('mcp__claude-flow__memory_usage', LIVE).refs,
    ['@claude-flow/memory_store', '@claude-flow/memory_retrieve', '@claude-flow/memory_search']);
  assert.equal(mapToolName('mcp__claude-flow__memory_usage', LIVE).kind, 'renamed');
});

test('mapToolName: stale claude-flow tool with no equivalent is dropped', () => {
  const m = mapToolName('mcp__claude-flow__parallel_execute', LIVE);
  assert.equal(m.kind, 'dropped');
  assert.deepEqual(m.refs, []);
});

test('mapToolName: other MCP servers preserved as @server/tool', () => {
  assert.deepEqual(mapToolName('mcp__github__create_pull_request', LIVE), { refs: ['@github/create_pull_request'], kind: 'mcp-other' });
});

test('expandProfile: category filter + extraTools', () => {
  const live = new Set(['memory_store', 'memory_search', 'task_create', 'hooks_notify', 'swarm_init']);
  assert.deepEqual(
    expandProfile({ categories: ['memory'], extraTools: ['hooks_notify', 'not_a_tool'] }, live),
    ['hooks_notify', 'memory_search', 'memory_store'],
  );
  assert.equal(expandProfile({ categories: ['*'] }, live).length, 5);
});

// ── full corpus conversion (dry run, in-memory) ──

test('corpus: converts 88 agents from the 108-file reference corpus', { skip: !hasCorpus }, () => {
  const { agents, manifest, report } = convertAgents({ source: CORPUS, out: '/nonexistent', write: false });
  assert.equal(report.counts.sourceFiles, 108);
  assert.equal(report.counts.emitted, 88);
  assert.equal(agents.length, 88);
  assert.equal(manifest.length, 88);
  // 9 templates/ files + MIGRATION_SUMMARY.md
  assert.equal(report.counts.skipped, 10);
  assert.equal(report.skipped.filter((s) => s.reason.includes('templates')).length, 9);
  // 10 duplicate names resolved
  assert.equal(report.counts.deduped, 10);
  // no duplicate output names
  const names = agents.map((a) => a.json.name);
  assert.equal(new Set(names).size, names.length);
  // all 12 core agents exist in the corpus
  assert.equal(manifest.filter((m) => m.core).length, 12);
});

test('corpus: every generated agent validates against the Kiro agent schema', { skip: !hasCorpus }, () => {
  const schema = JSON.parse(readFileSync(SCHEMA, 'utf8'));
  const ajv = new Ajv2020({ strict: false });
  const validate = ajv.compile(schema);
  const { agents } = convertAgents({ source: CORPUS, out: '/nonexistent', write: false });
  for (const { json } of agents) {
    assert.ok(validate(json), `${json.name}: ${JSON.stringify(validate.errors)}`);
  }
});

test('corpus: invariants — prompts, tool refs, allowlist safety', { skip: !hasCorpus }, () => {
  const { agents } = convertAgents({ source: CORPUS, out: '/nonexistent', write: false });
  for (const { json, promptBody } of agents) {
    assert.match(json.name, /^kf-[a-z0-9][a-z0-9_-]*$/);
    assert.equal(json.prompt, `file://./prompts/${json.name}.md`);
    assert.ok(promptBody.trim().length > 0, `${json.name}: empty prompt body`);
    assert.ok(json.tools.includes('read') && json.tools.includes('write') && json.tools.includes('shell'));
    // allowedTools must never auto-approve write, shell, or foreign MCP servers
    for (const t of json.allowedTools) {
      assert.ok(t === 'read' || t.startsWith('@claude-flow/'), `${json.name}: unsafe allowedTools entry ${t}`);
    }
    // every allowed tool is also advertised
    for (const t of json.allowedTools) assert.ok(json.tools.includes(t), `${json.name}: ${t} allowed but not in tools`);
    assert.equal(json.includeMcpJson, true);
  }
});

test('corpus: deterministic output', { skip: !hasCorpus }, () => {
  const a = convertAgents({ source: CORPUS, out: '/nonexistent', write: false });
  const b = convertAgents({ source: CORPUS, out: '/nonexistent', write: false });
  assert.deepEqual(
    a.agents.map((x) => JSON.stringify(x.json)),
    b.agents.map((x) => JSON.stringify(x.json)),
  );
});

test('corpus: golden snapshots', { skip: !hasCorpus }, () => {
  const { agents } = convertAgents({ source: CORPUS, out: '/nonexistent', write: false });
  const byName = new Map(agents.map((a) => [a.json.name, a.json]));
  for (const golden of ['kf-researcher', 'kf-pr-manager', 'kf-backend-dev', 'kf-queen-coordinator', 'kf-repo-architect']) {
    const expected = JSON.parse(readFileSync(join(here, 'golden', `${golden}.json`), 'utf8'));
    assert.deepEqual(byName.get(golden), expected, `${golden} drifted from golden file`);
  }
});
