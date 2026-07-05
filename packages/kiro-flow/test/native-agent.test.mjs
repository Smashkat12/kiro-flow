/**
 * M11 native-agent enrichment: #2 native tool budgets + #3 per-agent model
 * routing. Verifies the converter grants Kiro-native productivity tools per
 * role (safe → pre-trusted) and routes heavy roles to a stronger model, all
 * resolved through an overridable model map.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertAgents } from '../src/convert/agents.mjs';
import { parseModels } from '../src/doctor.mjs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  NATIVE_TOOLS, NATIVE_TOOLS_BY_PROFILE, nativeToolsFor,
  DEFAULT_MODEL_MAP, MODEL_TIER_BY_PROFILE, modelFor, isCoordinator,
} from '../src/convert/tool-map.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(here, '..', '..', '..', 'reference', 'ruflo', '.claude', 'agents');
const SCHEMA = join(here, '..', '..', '..', 'schemas', 'kiro-agent.schema.json');
const hasCorpus = existsSync(CORPUS);

// ── #2 native tools: the set is safe (never write/shell/fan-out) ──

test('native tools are read-only / side-effect-free (safe to pre-trust)', () => {
  const unsafe = ['write', 'shell', 'delegate', 'subagent', 'aws'];
  for (const t of NATIVE_TOOLS) {
    assert.ok(!unsafe.includes(t), `${t} is not safe to pre-trust`);
  }
  // every profile's set is a subset of the declared union
  for (const [profile, tools] of Object.entries(NATIVE_TOOLS_BY_PROFILE)) {
    for (const t of tools) assert.ok(NATIVE_TOOLS.includes(t), `${profile}: ${t} missing from NATIVE_TOOLS`);
  }
});

test('nativeToolsFor falls back to the lean worker set for unknown profiles', () => {
  assert.deepEqual(nativeToolsFor('does-not-exist'), NATIVE_TOOLS_BY_PROFILE.worker);
  assert.ok(nativeToolsFor('researcher').includes('knowledge'), 'researchers get the knowledge tool');
  assert.ok(!nativeToolsFor('worker').includes('thinking'), 'lean workers skip extended thinking');
});

// ── #3 model routing resolution ──

test('modelFor: profile tiers resolve through the default map', () => {
  assert.equal(modelFor('coder', 'core'), DEFAULT_MODEL_MAP.strong);
  assert.equal(modelFor('coder', 'worker'), null, 'balanced → omit the field');
  assert.equal(modelFor('reviewer', 'worker'), DEFAULT_MODEL_MAP.strong, 'name override beats profile');
  // strong is set for exactly the heavy profiles
  for (const [profile, tier] of Object.entries(MODEL_TIER_BY_PROFILE)) {
    assert.equal(modelFor('x', profile), tier === 'balanced' ? null : DEFAULT_MODEL_MAP[tier]);
  }
});

test('modelFor: a workspace override map re-routes tiers', () => {
  const override = { ...DEFAULT_MODEL_MAP, strong: 'glm-5', fast: 'qwen3-coder-next' };
  assert.equal(modelFor('coder', 'core', override), 'glm-5');
  assert.equal(modelFor('x', 'worker', override), null); // balanced still omitted
});

// ── #1 native subagent delegation ──

test('isCoordinator: needs both a coordination profile and a coordinator-ish name', () => {
  assert.ok(isCoordinator('queen-coordinator', 'core'));
  assert.ok(isCoordinator('raft-manager', 'core'));
  assert.ok(isCoordinator('dual-orchestrator', 'core'));
  assert.ok(!isCoordinator('pr-manager', 'github'), 'name matches but wrong profile → leaf');
  assert.ok(!isCoordinator('matrix-optimizer', 'core'), 'core profile but not a coordinator name → leaf');
  assert.ok(!isCoordinator('backend-dev', 'worker'));
});

test('coordinators get a native subagent delegation roster; leaves do not', { skip: !hasCorpus }, () => {
  const { agents } = convertAgents({ source: CORPUS, out: '/nonexistent', write: false });
  const names = new Set(agents.map(({ json }) => json.name));
  const coordinators = agents.filter(({ json }) => json.toolsSettings?.subagent);
  assert.ok(coordinators.length >= 5, 'expected a handful of coordinators');

  for (const { json } of coordinators) {
    assert.ok(json.tools.includes('subagent'), `${json.name}: coordinator missing subagent tool`);
    const { availableAgents, trustedAgents } = json.toolsSettings.subagent;
    assert.deepEqual(availableAgents, trustedAgents, `${json.name}: roster should be fully trusted`);
    assert.ok(availableAgents.length > 0, `${json.name}: empty roster`);
    for (const r of availableAgents) {
      assert.ok(names.has(r), `${json.name}: roster references non-existent agent ${r}`);
      assert.notEqual(r, json.name, `${json.name}: must not delegate to itself`);
    }
  }
  // a leaf agent (worker) has neither the tool nor the settings
  const leaf = agents.find(({ json }) => json.name === 'kf-backend-dev');
  if (leaf) {
    assert.ok(!leaf.json.toolsSettings, 'kf-backend-dev should stay a leaf');
    assert.ok(!leaf.json.tools.includes('subagent'), 'leaf should not advertise subagent');
  }
});

// ── resources pass: schema correctness (steering + skills auto-load, so we
//    don't emit per-agent resources; knowledgeBase is unsupported on the CLI) ──

test('schema: resources accept file://|skill:// strings, reject bare paths and knowledgeBase objects', () => {
  const ajv = new Ajv2020({ strict: false });
  const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA, 'utf8')));
  const base = { name: 'kf-x', description: 'd', prompt: 'p', tools: ['read'], includeMcpJson: true };
  assert.ok(validate({ ...base, resources: ['file://.kiro/steering/ruflo.md', 'skill://sparc-methodology'] }), 'file/skill strings should validate');
  assert.ok(!validate({ ...base, resources: ['docs/steering.md'] }), 'bare path must be rejected (kiro-cli errors at runtime)');
  assert.ok(!validate({ ...base, resources: [{ type: 'knowledgeBase', source: './x' }] }), 'knowledgeBase object must be rejected (unsupported on CLI 2.10.0)');
});

test('doctor parseModels: extracts ids from real --list-models output', () => {
  const sample = [
    'Available models (* = default):',
    '',
    '* auto                 1.00x credits      Models chosen by task',
    '  claude-sonnet-4.5    1.30x credits      Claude Sonnet 4.5 model',
    '  claude-haiku-4.5     0.40x credits      The latest Claude Haiku model',
    '  qwen3-coder-next     0.05x credits      Experimental preview',
  ].join('\n');
  const ids = parseModels(sample);
  assert.ok(ids.has('auto') && ids.has('claude-sonnet-4.5') && ids.has('claude-haiku-4.5'));
  assert.ok(!ids.has('Available'), 'header line is not a model id');
  assert.equal(ids.size, 4);
});

// ── end-to-end against the real corpus ──

test('converted agents carry native tools + routed model', { skip: !hasCorpus }, () => {
  const { agents } = convertAgents({ source: CORPUS, out: '/nonexistent', write: false });
  assert.ok(agents.length > 20, 'corpus produced a real agent set');
  for (const { json } of agents) {
    // every agent has at least the lean native trio, all also pre-trusted
    for (const t of ['glob', 'grep', 'todo']) {
      assert.ok(json.tools.includes(t), `${json.name}: missing native ${t}`);
      assert.ok(json.allowedTools.includes(t), `${json.name}: native ${t} not pre-trusted`);
    }
    // model, when present, is one of the map's concrete ids (never balanced/null)
    if ('model' in json) {
      assert.ok(Object.values(DEFAULT_MODEL_MAP).includes(json.model), `${json.name}: off-map model ${json.model}`);
      assert.notEqual(json.model, null);
    }
  }
  // at least some agents route to the strong model (coordinators/researchers)
  assert.ok(agents.some(({ json }) => json.model === DEFAULT_MODEL_MAP.strong), 'no agent routed to strong tier');
});

test('convertAgents honors a custom modelMap end-to-end', { skip: !hasCorpus }, () => {
  const modelMap = { ...DEFAULT_MODEL_MAP, strong: 'claude-sonnet-4' };
  const { agents } = convertAgents({ source: CORPUS, out: '/nonexistent', write: false, modelMap });
  const strong = agents.filter(({ json }) => json.model);
  assert.ok(strong.length > 0);
  for (const { json } of strong) assert.equal(json.model, 'claude-sonnet-4');
});
