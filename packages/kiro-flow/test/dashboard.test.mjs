/**
 * kiro-flow dashboard — collect local telemetry into one self-contained HTML
 * page (rebuild of ruflo's hosted agent dashboard on Kiro-local signals).
 * Collector on a synthetic workspace; renderer must stay self-contained
 * (no network/scripts) and escape untrusted strings.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectDashboardData, renderDashboardHtml, renderBody, createDashboardServer } from '../src/dashboard.mjs';

function seed() {
  const dir = mkdtempSync(join(tmpdir(), 'kf-dash-'));
  const w = (rel, obj) => { mkdirSync(join(dir, rel, '..'), { recursive: true }); writeFileSync(join(dir, rel), typeof obj === 'string' ? obj : JSON.stringify(obj)); };
  // agents + manifest
  w('.kiro/agents/kf-orchestrator.json', { name: 'kf-orchestrator', model: 'claude-opus-4.8', description: 'coordinates', tools: ['read', 'subagent'], toolsSettings: { subagent: { availableAgents: ['kf-coder', 'kf-tester'] } } });
  w('.kiro/agents/kf-coder.json', { name: 'kf-coder', model: 'claude-sonnet-4.6', description: 'writes <code> & "stuff"', tools: ['read', 'write', 'shell'] });
  w('.kiro/kiro-flow/agents-manifest.json', [
    { name: 'kf-orchestrator', core: false, profile: 'core', category: 'core' },
    { name: 'kf-coder', core: true, profile: 'core', category: 'core' },
  ]);
  // plugins, cost, learning, hive
  w('.kiro/kiro-flow/plugins.json', { enabled: ['ruflo-ddd'] });
  writeFileSync(join(dir, '.kiro', 'kiro-flow', 'cost-ledger.jsonl'),
    ['{"ts":"2026-07-05T10:00:00Z","credits":0.1,"model":"claude-sonnet-4.6","entrypoint":"worker"}',
     '{"ts":"2026-07-05T11:00:00Z","credits":0.4,"model":"claude-haiku-4.5","entrypoint":"fable-judge"}'].join('\n') + '\n');
  w('.claude-flow/metrics/learning.json', { routing: { accuracy: 0.82 }, patterns: { shortTerm: 3, longTerm: 5, quality: 0.6 }, sessions: { total: 4 } });
  w('.claude-flow/hive-mind/state.json', { sharedMemory: { a: 1, b: 2 }, consensus: 'byzantine' });
  w('.hive-mind/sessions/hive-mind-prompt-x.txt', 'objective');
  w('.swarm/memory.db', 'x'.repeat(2048));
  return dir;
}

test('collectDashboardData: reads agents, cost, plugins, hive, learning, memory', () => {
  const dir = seed();
  try {
    const d = collectDashboardData(dir);
    assert.equal(d.agents.length, 2);
    // core sorts first; coordinator flag detected from toolsSettings.subagent
    const orch = d.agents.find((a) => a.name === 'kf-orchestrator');
    assert.equal(orch.coordinator, true);
    assert.equal(orch.roster, 2);
    assert.equal(d.agents.find((a) => a.name === 'kf-coder').core, true);
    assert.deepEqual(d.plugins, ['ruflo-ddd']);
    assert.ok(Math.abs(d.cost.total - 0.5) < 1e-9);
    assert.equal(d.cost.count, 2);
    assert.equal(d.hive.sessions, 1);
    assert.equal(d.hive.sharedMemoryKeys, 2);
    assert.equal(d.memory.exists, true);
    assert.equal(d.memory.size, 2048);
    assert.equal(d.learning.routing.accuracy, 0.82);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('collectDashboardData: empty workspace degrades to zeros, never throws', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kf-dash-empty-'));
  try {
    const d = collectDashboardData(dir);
    assert.equal(d.agents.length, 0);
    assert.equal(d.cost.total, 0);
    assert.equal(d.memory.exists, false);
    assert.equal(d.hive.sessions, 0);
    assert.deepEqual(d.plugins, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('renderDashboardHtml: self-contained (no network/scripts), key sections, escaped', () => {
  const dir = seed();
  try {
    const html = renderDashboardHtml(collectDashboardData(dir));
    // self-contained: no external hosts, stylesheets, or remote src
    assert.ok(!/https?:\/\//.test(html.replace(/lang="en"|schema\.org/g, '')), 'no external URLs');
    assert.ok(!/<link\b|<script\s+src=|cdn|@import/i.test(html), 'no external assets');
    // no [object Object] leaks from nested metric objects
    assert.ok(!html.includes('[object Object]'), 'no stringified objects');
    // key sections render
    for (const s of ['kiro-flow', 'Credit spend', 'Hive / Swarm', 'Learning', 'Agents (2)', 'kf-orchestrator']) {
      assert.ok(html.includes(s), `missing section: ${s}`);
    }
    // untrusted agent description is HTML-escaped
    assert.ok(html.includes('writes &lt;code&gt; &amp; &quot;stuff&quot;'), 'description escaped');
    assert.ok(!html.includes('writes <code> & "stuff"'), 'raw description not injected');
    // learning nested metrics rendered as scalars
    assert.ok(html.includes('82%'), 'routing accuracy rendered');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('renderBody: returns a bare fragment (no page shell) for live swaps', () => {
  const dir = seed();
  try {
    const frag = renderBody(collectDashboardData(dir));
    assert.ok(!/<!doctype|<html|<head|<body/i.test(frag), 'fragment has no page shell');
    assert.ok(frag.includes('class="cards"') && frag.includes('Agents (2)'), 'fragment has the panels');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('renderDashboardHtml live mode: adds same-origin poller + live indicator, static does not', () => {
  const dir = seed();
  try {
    const data = collectDashboardData(dir);
    const live = renderDashboardHtml(data, { live: true, interval: 5 });
    assert.ok(live.includes('id="app"'), 'main is swappable');
    assert.ok(live.includes('/api/fragment') && live.includes('setInterval'), 'poller present');
    assert.ok(live.includes('<span class="live-dot">') && live.includes('every 5s'), 'live indicator + interval');
    assert.ok(!/https?:\/\//.test(live.replace(/lang="en"/g, '')), 'poller uses a same-origin relative URL, no external host');
    assert.ok(!live.includes('re-run <code>kiro-flow dashboard</code>'), 'no static snapshot label');

    const stat = renderDashboardHtml(data);
    // the .live-dot CSS class lives in the shared stylesheet; the poller + the
    // live timestamp span are the real live-only markers
    assert.ok(!stat.includes('setInterval') && !stat.includes('id="live-ts"'), 'static mode has no poller');
    assert.ok(!stat.includes('<span class="live-dot">'), 'static mode has no live indicator element');
    assert.ok(stat.includes('re-run <code>kiro-flow dashboard</code>'), 'static snapshot label present');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('renderDashboardHtml: empty workspace shows friendly fallbacks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kf-dash-empty2-'));
  try {
    const html = renderDashboardHtml(collectDashboardData(dir));
    assert.ok(html.includes('no agents converted yet'));
    assert.ok(html.includes('Agents (0)'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('neural: patterns.json feeds a neural-patterns group in the Learning panel', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kf-dash-neural-'));
  try {
    mkdirSync(join(dir, '.claude-flow', 'neural'), { recursive: true });
    writeFileSync(join(dir, '.claude-flow', 'neural', 'patterns.json'), JSON.stringify([
      { type: 'action', confidence: 1.0, usageCount: 100 },
      { type: 'action', confidence: 0.8, usageCount: 40 },
    ]));
    const d = collectDashboardData(dir);
    assert.equal(d.neural.patterns, 2);
    assert.ok(Math.abs(d.neural.avgConfidence - 0.9) < 1e-9);
    assert.equal(d.neural.totalUses, 140);

    const html = renderDashboardHtml(d);
    assert.ok(html.includes('neural patterns') && html.includes('>2<'), 'neural count rendered');
    assert.ok(html.includes('90%'), 'avg confidence rendered');
    assert.ok(html.includes('>140<'), 'total uses rendered');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('serve mode: loopback server serves page / fragment / data, and 404s', async () => {
  const dir = seed();
  const server = createDashboardServer(dir);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const page = await fetch(`${base}/`);
    const pageHtml = await page.text();
    assert.equal(page.status, 200);
    assert.ok(pageHtml.includes('id="app"') && pageHtml.includes('/api/fragment'), 'live page with poller');

    const frag = await (await fetch(`${base}/api/fragment`)).text();
    assert.ok(!/<html/i.test(frag) && frag.includes('Agents (2)'), 'fragment is bare body');

    const data = await (await fetch(`${base}/api/data`)).json();
    assert.equal(data.agents.length, 2);
    assert.ok(Math.abs(data.cost.total - 0.5) < 1e-9);

    assert.equal((await fetch(`${base}/nope`)).status, 404);
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
