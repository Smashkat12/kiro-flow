/**
 * kiro-flow models — resolved tier map + pinned-model availability report.
 * `available` is injected so tests don't depend on a live kiro-cli.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { modelsCommand } from '../src/models.mjs';

/** Capture console.log output of a thunk. */
function captured(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  try { const code = fn(); return { code, out: lines.join('\n') }; }
  finally { console.log = orig; }
}

/** A workspace with an opus flagship, a sonnet library agent, and an auto worker. */
function seed(mapOverride) {
  const dir = mkdtempSync(join(tmpdir(), 'kf-models-'));
  mkdirSync(join(dir, '.kiro', 'agents'), { recursive: true });
  mkdirSync(join(dir, '.kiro', 'kiro-flow'), { recursive: true });
  const agent = (name, model) => writeFileSync(
    join(dir, '.kiro', 'agents', `${name}.json`),
    JSON.stringify({ name, description: 'd', prompt: 'p', tools: ['read'], ...(model ? { model } : {}), includeMcpJson: true }),
  );
  agent('kf-queen', 'claude-opus-4.8');
  agent('kf-researcher', 'claude-sonnet-4.6');
  agent('kf-backend-dev'); // auto
  if (mapOverride) writeFileSync(join(dir, '.kiro', 'kiro-flow', 'model-map.json'), JSON.stringify(mapOverride));
  return dir;
}

test('models: all routed models available → exit 0, shows tier map + pins', () => {
  const dir = seed();
  try {
    const avail = new Set(['claude-opus-4.8', 'claude-sonnet-4.6', 'claude-haiku-4.5', 'auto']);
    const { code, out } = captured(() => modelsCommand({ dir, available: avail }));
    assert.equal(code, 0);
    assert.match(out, /tier → model map/);
    assert.match(out, /opus\s+claude-opus-4\.8/);
    assert.match(out, /every routed model is offered/);
    assert.match(out, /kf-queen/); // pinned-agent sample listed
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('models: a pinned model this Kiro lacks → exit 1 with the fix hint', () => {
  const dir = seed();
  try {
    const avail = new Set(['claude-sonnet-4.5', 'claude-haiku-4.5', 'auto']); // no opus-4.8 / sonnet-4.6
    const { code, out } = captured(() => modelsCommand({ dir, available: avail }));
    assert.equal(code, 1);
    assert.match(out, /not offered by this Kiro:/);
    assert.match(out, /claude-opus-4\.8/);
    assert.match(out, /claude-sonnet-4\.6/);
    assert.match(out, /model-map\.json/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('models: kiro-cli unavailable (null) → exit 0, availability unverified', () => {
  const dir = seed();
  try {
    const { code, out } = captured(() => modelsCommand({ dir, available: null }));
    assert.equal(code, 0);
    assert.match(out, /availability unverified/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('models: workspace override map is read and labelled', () => {
  const dir = seed({ opus: 'claude-opus-4.6', strong: 'claude-sonnet-4', balanced: null, fast: 'claude-haiku-4.5' });
  try {
    const avail = new Set(['claude-opus-4.6', 'claude-sonnet-4', 'claude-haiku-4.5']);
    const { out } = captured(() => modelsCommand({ dir, available: avail }));
    assert.match(out, /model-map\.json\):/); // labelled as override, not defaults
    assert.match(out, /opus\s+claude-opus-4\.6/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
