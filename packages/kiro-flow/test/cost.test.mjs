/**
 * kiro-flow cost — persist + aggregate Kiro credit spend (rebuild of ruflo's
 * transcript-based cost-tracker on Kiro's `▸ Credits:` footer). Pure logic on
 * a synthetic ledger; the shim's live append is covered by an e2e shim check.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  recordCost, readLedger, summarize, costCommand, COST_LEDGER_REL,
} from '../src/cost.mjs';

const ws = () => mkdtempSync(join(tmpdir(), 'kf-cost-'));

test('recordCost → readLedger round-trips, tolerating corrupt lines', () => {
  const dir = ws();
  try {
    recordCost(dir, { credits: 0.1, model: 'claude-sonnet-4.5', entrypoint: 'worker', exit: 0, ts: '2026-07-05T10:00:00Z' });
    recordCost(dir, { credits: 0.4, model: 'claude-haiku-4.5', entrypoint: 'fable-judge', exit: 0, ts: '2026-07-05T11:00:00Z' });
    // a null-credit call (no footer) is still logged as an invocation
    recordCost(dir, { credits: undefined, model: 'auto', entrypoint: 'worker', exit: 1, ts: '2026-07-05T12:00:00Z' });
    // inject a corrupt line
    appendFileSync(join(dir, COST_LEDGER_REL), 'not json\n');

    const rows = readLedger(dir);
    assert.equal(rows.length, 3, 'corrupt line skipped');
    assert.equal(rows[0].credits, 0.1);
    assert.equal(rows[2].credits, null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('recordCost never throws on a bad dir', () => {
  assert.doesNotThrow(() => recordCost('/nonexistent/\0/bad', { credits: 1 }));
});

test('summarize: totals + breakdowns by model/entrypoint/day, ignores null credits', () => {
  const rows = [
    { ts: '2026-07-05T10:00:00Z', credits: 0.1, model: 'claude-sonnet-4.5', entrypoint: 'worker' },
    { ts: '2026-07-05T11:00:00Z', credits: 0.4, model: 'claude-haiku-4.5', entrypoint: 'fable-judge' },
    { ts: '2026-07-06T09:00:00Z', credits: 0.2, model: 'claude-sonnet-4.5', entrypoint: 'worker' },
    { ts: '2026-07-06T09:30:00Z', credits: null, model: 'auto', entrypoint: 'worker' },
  ];
  const s = summarize(rows);
  assert.ok(Math.abs(s.total - 0.7) < 1e-9);
  assert.equal(s.count, 4);
  assert.equal(s.credited, 3);
  assert.ok(Math.abs(s.byModel['claude-sonnet-4.5'] - 0.3) < 1e-9);
  assert.ok(Math.abs(s.byEntrypoint['fable-judge'] - 0.4) < 1e-9);
  assert.ok(Math.abs(s.byDay['2026-07-05'] - 0.5) < 1e-9);
  assert.ok(Math.abs(s.byDay['2026-07-06'] - 0.2) < 1e-9);
});

test('summarize: sinceDays window filters older rows', () => {
  const now = Date.parse('2026-07-10T00:00:00Z');
  const rows = [
    { ts: '2026-07-01T00:00:00Z', credits: 5, model: 'x', entrypoint: 'worker' }, // 9 days ago
    { ts: '2026-07-09T00:00:00Z', credits: 2, model: 'x', entrypoint: 'worker' }, // 1 day ago
  ];
  assert.equal(summarize(rows, { sinceDays: 3, now }).total, 2);
  assert.equal(summarize(rows, { now }).total, 7);
});

test('summarize: USD column when KIRO_FLOW_CREDIT_USD set', () => {
  const rows = [{ ts: '2026-07-05T10:00:00Z', credits: 2, model: 'x', entrypoint: 'worker' }];
  const prev = process.env.KIRO_FLOW_CREDIT_USD;
  try {
    process.env.KIRO_FLOW_CREDIT_USD = '0.05';
    const s = summarize(rows);
    assert.equal(s.usdPerCredit, 0.05);
    assert.ok(Math.abs(s.totalUsd - 0.1) < 1e-9);
    delete process.env.KIRO_FLOW_CREDIT_USD;
    assert.equal(summarize(rows).usdPerCredit, null);
  } finally { if (prev == null) delete process.env.KIRO_FLOW_CREDIT_USD; else process.env.KIRO_FLOW_CREDIT_USD = prev; }
});

test('costCommand add appends a manual row; clear truncates; report exits 0', () => {
  const dir = ws();
  try {
    assert.equal(costCommand({ dir, sub: 'add', credits: 0.25, model: 'claude-sonnet-4.5', note: 'demo' }), 0);
    const rows = readLedger(dir);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].entrypoint, 'manual');
    assert.equal(rows[0].note, 'demo');

    // add with no credits → usage error, exit 1
    assert.equal(costCommand({ dir, sub: 'add' }), 1);

    // report (json) exits 0
    assert.equal(costCommand({ dir, json: true }), 0);

    assert.equal(costCommand({ dir, sub: 'clear' }), 0);
    assert.equal(readLedger(dir).length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
