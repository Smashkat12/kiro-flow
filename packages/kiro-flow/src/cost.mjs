/**
 * kiro-flow cost — rebuild ruflo's cost-tracker on Kiro's native credit signal.
 *
 * ruflo's cost-tracker plugin reads Claude Code transcripts (~/.claude/projects
 * /**\/*.jsonl) for token counts + USD. Kiro has no transcript tree, but every
 * kiro-cli turn prints a `▸ Credits: X.XX` footer. The kiro-claude-shim already
 * parses that for the result envelope; here we PERSIST it: every kiro-flow →
 * kiro-cli invocation appends a row to a workspace-local JSONL ledger, and
 * `kiro-flow cost` aggregates it (by model / entrypoint / day, → USD when
 * KIRO_FLOW_CREDIT_USD is set — the same knob the shim uses).
 *
 * Coverage: the shim captures the automated planes (daemon workers, headless
 * `worker`, the fable judge) — the bulk of background spend. Interactive
 * `kiro-cli chat` and stdio-inherited launches (`cmd`, `hive-mind`) show the
 * footer live in the terminal but are not auto-captured; log those with
 * `kiro-flow cost add <credits>`.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const COST_LEDGER_REL = join('.kiro', 'kiro-flow', 'cost-ledger.jsonl');

/**
 * Append one invocation to the ledger. Never throws — a cost write must never
 * break a worker. `ts` is injectable for tests; defaults to now.
 */
export function recordCost(dir, { credits, model, entrypoint, session, exit, note, ts } = {}) {
  try {
    const path = join(dir, COST_LEDGER_REL);
    mkdirSync(dirname(path), { recursive: true });
    const row = {
      ts: ts ?? new Date().toISOString(),
      credits: Number.isFinite(credits) ? credits : null,
      model: model ?? null,
      entrypoint: entrypoint ?? 'worker',
      ...(session ? { session } : {}),
      ...(Number.isFinite(exit) ? { exit } : {}),
      ...(note ? { note } : {}),
    };
    appendFileSync(path, JSON.stringify(row) + '\n');
    return row;
  } catch { return null; }
}

/** Parse the JSONL ledger, tolerating blank/corrupt lines. */
export function readLedger(dir) {
  const path = join(dir, COST_LEDGER_REL);
  if (!existsSync(path)) return [];
  const rows = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { rows.push(JSON.parse(t)); } catch { /* skip corrupt */ }
  }
  return rows;
}

/** USD per credit from env (0/absent → no USD column). */
export function creditUsd() {
  const u = Number(process.env.KIRO_FLOW_CREDIT_USD);
  return Number.isFinite(u) && u > 0 ? u : null;
}

/**
 * Aggregate ledger rows. `sinceDays` (optional) filters to the trailing window;
 * `now` is injectable for tests.
 * @returns {{total, count, credited, byModel, byEntrypoint, byDay, usdPerCredit, totalUsd}}
 */
export function summarize(rows, { sinceDays, now = Date.now() } = {}) {
  const cutoff = sinceDays ? now - sinceDays * 86_400_000 : null;
  const usd = creditUsd();
  const acc = { total: 0, count: 0, credited: 0, byModel: {}, byEntrypoint: {}, byDay: {} };
  for (const r of rows) {
    if (cutoff != null) {
      const t = Date.parse(r.ts);
      if (Number.isFinite(t) && t < cutoff) continue;
    }
    acc.count += 1;
    const c = Number.isFinite(r.credits) ? r.credits : 0;
    if (Number.isFinite(r.credits)) acc.credited += 1;
    acc.total += c;
    const day = String(r.ts ?? '').slice(0, 10) || 'unknown';
    const model = r.model ?? 'auto';
    const ep = r.entrypoint ?? 'worker';
    acc.byModel[model] = (acc.byModel[model] ?? 0) + c;
    acc.byEntrypoint[ep] = (acc.byEntrypoint[ep] ?? 0) + c;
    acc.byDay[day] = (acc.byDay[day] ?? 0) + c;
  }
  acc.usdPerCredit = usd;
  acc.totalUsd = usd != null ? acc.total * usd : null;
  return acc;
}

const fmtCred = (c) => c.toFixed(2);
const withUsd = (c, usd) => (usd != null ? `  ($${(c * usd).toFixed(2)})` : '');

function printReport(s, { sinceDays }) {
  const scope = sinceDays ? ` — last ${sinceDays}d` : '';
  if (!s.count) {
    console.log(`no cost ledger yet${scope}. The shim logs daemon/worker/judge spend automatically;`);
    console.log(`log interactive turns with: kiro-flow cost add <credits> [--model m] [--note n]`);
    return;
  }
  console.log(`kiro-flow cost${scope}\n`);
  console.log(`  total    ${fmtCred(s.total)} credits${withUsd(s.total, s.usdPerCredit)}   (${s.count} calls, ${s.credited} with a credit reading)`);
  const table = (title, obj) => {
    const entries = Object.entries(obj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return;
    console.log(`\n  by ${title}:`);
    for (const [k, v] of entries) console.log(`    ${k.padEnd(22)} ${fmtCred(v).padStart(9)}${withUsd(v, s.usdPerCredit)}`);
  };
  table('model', s.byModel);
  table('entrypoint', s.byEntrypoint);
  table('day', s.byDay);
  if (s.usdPerCredit == null) console.log(`\n  (set KIRO_FLOW_CREDIT_USD=<usd-per-credit> for a $ column)`);
}

/** CLI: `kiro-flow cost [report|add|clear] …`. Returns an exit code. */
export function costCommand({ dir, sub, json = false, sinceDays, credits, model, note }) {
  if (sub === 'add') {
    if (!Number.isFinite(credits)) { console.error('usage: kiro-flow cost add <credits> [--model m] [--note n]'); return 1; }
    const row = recordCost(dir, { credits, model, entrypoint: 'manual', note });
    if (!row) { console.error('failed to write ledger'); return 1; }
    console.log(`logged ${fmtCred(credits)} credits (manual)${model ? ` model=${model}` : ''}${note ? ` — ${note}` : ''}`);
    return 0;
  }
  if (sub === 'clear') {
    const path = join(dir, COST_LEDGER_REL);
    if (existsSync(path)) writeFileSync(path, '');
    console.log('cost ledger cleared');
    return 0;
  }
  // default: report
  const rows = readLedger(dir);
  const s = summarize(rows, { sinceDays });
  if (json) { console.log(JSON.stringify(s, null, 2)); return 0; }
  printReport(s, { sinceDays });
  return 0;
}
