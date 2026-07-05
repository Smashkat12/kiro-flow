/**
 * kiro-flow plugins — enable port-tier ruflo plugins (agents+commands+skills)
 * on Kiro. Discovery/persist/extraSources/reconcile logic on synthetic
 * fixtures; a couple corpus-gated checks that the vendored plugins actually
 * convert against the reference agent library.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertAgents } from '../src/convert/agents.mjs';
import {
  discoverPlugins, resolvePlugins, writePlugins, pluginExtraSources,
  reconcilePlugins, pluginsCommand, PLUGINS_REL,
} from '../src/plugins.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const CORPUS = join(repoRoot, 'reference', 'ruflo', '.claude', 'agents');
const hasCorpus = existsSync(CORPUS);
const FLAGSHIPS = ['kf-orchestrator', 'kf-queen', 'kf-deep-researcher'];

const PORT = [
  'ruflo-adr', 'ruflo-ddd', 'ruflo-docs', 'ruflo-goals',
  'ruflo-knowledge-graph', 'ruflo-migrations', 'ruflo-plugin-creator', 'ruflo-security-audit',
];

// ── vendored discovery ──

test('discoverPlugins: all 8 port-tier plugins vendored with shape + category', () => {
  const all = discoverPlugins();
  assert.deepEqual(all.map((p) => p.name).sort(), [...PORT].sort());
  const ddd = all.find((p) => p.name === 'ruflo-ddd');
  assert.equal(ddd.short, 'ddd');
  assert.equal(ddd.category, 'architecture');           // mapped to a real tool profile
  assert.deepEqual(ddd.agentKfNames, ['kf-domain-modeler']);
  assert.ok(ddd.description.length > 0);
  const goals = all.find((p) => p.name === 'ruflo-goals');
  assert.equal(goals.agents.length, 4);
  assert.ok(goals.skills.length >= 1 && goals.commands.length >= 1);
});

// ── persisted enabled set ──

test('resolvePlugins: add/remove persists, filters unknown, sorts unique', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kf-plugins-'));
  try {
    // unknown names are dropped; known ones sorted-unique
    let enabled = resolvePlugins(dir, { add: ['ruflo-ddd', 'ruflo-ddd', 'not-a-plugin'] });
    assert.deepEqual(enabled, ['ruflo-ddd']);
    writePlugins(dir, enabled);
    assert.ok(existsSync(join(dir, PLUGINS_REL)));

    enabled = resolvePlugins(dir, { add: ['ruflo-adr'] });
    assert.deepEqual(enabled, ['ruflo-adr', 'ruflo-ddd']);
    writePlugins(dir, enabled);

    enabled = resolvePlugins(dir, { remove: ['ruflo-ddd'] });
    assert.deepEqual(enabled, ['ruflo-adr']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('pluginExtraSources: agent dirs only for enabled plugins that ship agents', () => {
  const ex = pluginExtraSources(['ruflo-ddd', 'ruflo-security-audit']);
  assert.equal(ex.length, 2);
  assert.ok(ex.every((e) => e.dir.endsWith(join('agents')) && e.category));
  assert.deepEqual(pluginExtraSources([]), []);
});

// ── conversion merge (corpus-gated) ──

test('convertAgents extraSources: net-new agent lands, collision dedups', { skip: !hasCorpus }, () => {
  const base = convertAgents({ source: CORPUS, out: '/nonexistent', write: false });
  const withDdd = convertAgents({
    source: CORPUS, out: '/nonexistent', write: false,
    extraSources: pluginExtraSources(['ruflo-ddd']),
  });
  // domain-modeler is unique to the plugin → exactly one net-new agent
  assert.equal(withDdd.agents.length, base.agents.length + 1);
  const dm = withDdd.agents.find((a) => a.json.name === 'kf-domain-modeler');
  assert.ok(dm, 'kf-domain-modeler emitted');
  assert.ok(dm.json.tools.includes('read') && dm.json.tools.includes('write'));

  // goals ships goal-planner which the base library already has → no duplicate name
  const withGoals = convertAgents({
    source: CORPUS, out: '/nonexistent', write: false,
    extraSources: pluginExtraSources(['ruflo-goals']),
  });
  const names = withGoals.agents.map((a) => a.json.name);
  assert.equal(new Set(names).size, names.length, 'no duplicate agent names after merge');
  assert.ok(names.includes('kf-goal-planner'));
});

// ── reconcile: install / prune / protect ──

/** A workspace with .kiro/agents (some seeded) + an empty .claude/skills base. */
function seedWorkspace(emitted = []) {
  const dir = mkdtempSync(join(tmpdir(), 'kf-plugins-ws-'));
  mkdirSync(join(dir, '.kiro', 'agents', 'prompts'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'skills'), { recursive: true });
  for (const kf of emitted) {
    writeFileSync(join(dir, '.kiro', 'agents', `${kf}.json`), '{}');
    writeFileSync(join(dir, '.kiro', 'agents', 'prompts', `${kf}.md`), 'x');
  }
  return dir;
}

test('reconcilePlugins: enabling installs skills + namespaced commands', () => {
  const dir = seedWorkspace(['kf-domain-modeler']);
  try {
    const s = reconcilePlugins(dir, ['ruflo-ddd'], new Set(['kf-domain-modeler']), FLAGSHIPS);
    assert.ok(s.installedSkills.includes('ddd-context'));
    assert.ok(s.installedCommands.some((c) => c.startsWith('ddd/')));
    assert.ok(existsSync(join(dir, '.kiro', 'skills', 'ddd-context', 'SKILL.md')));
    assert.ok(existsSync(join(dir, '.claude', 'commands', 'ddd', 'ddd.md')));
    // domain-modeler is emitted → not pruned
    assert.ok(existsSync(join(dir, '.kiro', 'agents', 'kf-domain-modeler.json')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('reconcilePlugins: disabling prunes the plugin unique agent + its skills/commands', () => {
  const dir = seedWorkspace(['kf-domain-modeler']);
  try {
    reconcilePlugins(dir, ['ruflo-ddd'], new Set(['kf-domain-modeler']), FLAGSHIPS); // enable
    // now disable: emitted no longer contains kf-domain-modeler
    const s = reconcilePlugins(dir, [], new Set([]), FLAGSHIPS);
    assert.ok(s.prunedAgents.includes('kf-domain-modeler'));
    assert.ok(!existsSync(join(dir, '.kiro', 'agents', 'kf-domain-modeler.json')));
    assert.ok(!existsSync(join(dir, '.kiro', 'skills', 'ddd-context')), 'plugin skill removed');
    assert.ok(!existsSync(join(dir, '.claude', 'commands', 'ddd')), 'plugin command dir removed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('reconcilePlugins: never prunes a flagship even when a plugin owns the name', () => {
  // ruflo-goals ships deep-researcher → kf-deep-researcher, which is a flagship
  const dir = seedWorkspace(['kf-deep-researcher']);
  try {
    // goals disabled, kf-deep-researcher NOT in emitted, but protected as flagship
    const s = reconcilePlugins(dir, [], new Set([]), FLAGSHIPS);
    assert.ok(!s.prunedAgents.includes('kf-deep-researcher'));
    assert.ok(existsSync(join(dir, '.kiro', 'agents', 'kf-deep-researcher.json')), 'flagship kept');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('reconcilePlugins: never removes a base skill that shares a plugin skill name', () => {
  const dir = seedWorkspace();
  try {
    // pretend the base .claude/skills owns a skill named like a plugin's
    mkdirSync(join(dir, '.claude', 'skills', 'ddd-context'), { recursive: true });
    // and it's installed into .kiro/skills
    mkdirSync(join(dir, '.kiro', 'skills', 'ddd-context'), { recursive: true });
    writeFileSync(join(dir, '.kiro', 'skills', 'ddd-context', 'SKILL.md'), 'base-owned');
    const s = reconcilePlugins(dir, [], new Set([]), FLAGSHIPS); // ddd disabled
    assert.ok(!s.removedSkills.includes('ddd-context'), 'base-owned skill not treated as plugin-owned');
    assert.ok(existsSync(join(dir, '.kiro', 'skills', 'ddd-context')), 'base skill preserved');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── CLI surface ──

test('pluginsCommand: list is exit 0; add/remove drive reinit; unknown → exit 1', () => {
  const dir = seedWorkspace();
  const calls = [];
  const reinit = (enabled) => { calls.push([...enabled]); return { installedSkills: [], installedCommands: [], removedSkills: [], removedCommands: [], prunedAgents: [] }; };
  assert.equal(pluginsCommand({ dir, sub: 'list', reinit }), 0);
  // short name accepted, reinit gets the resolved enabled set
  assert.equal(pluginsCommand({ dir, sub: 'add', names: ['ddd'], reinit }), 0);
  assert.deepEqual(calls.at(-1), ['ruflo-ddd']);
  // unknown plugin → error, no reinit
  const before = calls.length;
  assert.equal(pluginsCommand({ dir, sub: 'add', names: ['nope'], reinit }), 1);
  assert.equal(calls.length, before, 'reinit not called on bad input');
  rmSync(dir, { recursive: true, force: true });
});
