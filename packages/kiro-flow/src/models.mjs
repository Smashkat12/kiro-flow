/**
 * kiro-flow models — show the resolved tier→model map for a workspace, which
 * agents pin which model, and flag any pinned model this Kiro won't serve
 * (cross-checked against `kiro-cli chat --list-models`). The quick "is my model
 * routing sane on this machine?" view; `doctor` folds the same check into its
 * run.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveModelMap, MODEL_MAP_REL } from './init.mjs';
import { parseModels } from './doctor.mjs';

/** Available model ids from `kiro-cli chat --list-models`, or null if unavailable. */
function availableModels() {
  try {
    const out = execFileSync('kiro-cli', ['chat', '--list-models'], {
      encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return parseModels(out);
  } catch { return null; }
}

/** Map<modelId | '(auto)', string[] agentNames> across workspace + global agents. */
function collectPins(dir) {
  const pins = new Map();
  const bump = (id, name) => (pins.get(id) ?? pins.set(id, []).get(id)).push(name);
  const scan = (agentsDir, suffix = '') => {
    if (!existsSync(agentsDir)) return;
    for (const f of readdirSync(agentsDir)) {
      if (!f.startsWith('kf-') || !f.endsWith('.json')) continue;
      try {
        const a = JSON.parse(readFileSync(join(agentsDir, f), 'utf8'));
        bump(a.model && a.model !== 'auto' ? a.model : '(auto)', (a.name ?? f) + suffix);
      } catch { /* skip unparsable — doctor's agents check covers it */ }
    }
  };
  scan(join(dir, '.kiro', 'agents'));
  const globalJudge = join(homedir(), '.kiro', 'agents', 'kf-judge.json');
  if (existsSync(globalJudge)) {
    try {
      const a = JSON.parse(readFileSync(globalJudge, 'utf8'));
      bump(a.model && a.model !== 'auto' ? a.model : '(auto)', (a.name ?? 'kf-judge') + ' (global)');
    } catch { /* skip */ }
  }
  return pins;
}

const TIER_ORDER = ['opus', 'strong', 'balanced', 'fast'];

/**
 * CLI: `kiro-flow models [--dir <dir>]`. Returns an exit code (1 if a pinned
 * model is unavailable). `available` is injectable for tests (a Set of ids, or
 * null when the list couldn't be fetched); defaults to `kiro-cli --list-models`.
 */
export function modelsCommand({ dir, available }) {
  const map = resolveModelMap(dir);
  const overridden = existsSync(join(dir, MODEL_MAP_REL));
  const avail = available === undefined ? availableModels() : available;
  const mark = (id) => (id == null ? ' ' : avail == null ? '?' : avail.has(id) ? '✓' : '✗');

  console.log(`tier → model map${overridden ? ` (${MODEL_MAP_REL})` : ' (defaults)'}:`);
  for (const tier of TIER_ORDER) {
    if (!(tier in map)) continue;
    const id = map[tier];
    console.log(`  ${mark(id)} ${tier.padEnd(9)} ${id ?? '(auto — field omitted, Kiro picks per task)'}`);
  }

  const pins = collectPins(dir);
  if (pins.size) {
    const total = [...pins.values()].reduce((n, a) => n + a.length, 0);
    console.log(`\npinned by agents (${total} total):`);
    const rows = [...pins.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [id, names] of rows) {
      const m = id === '(auto)' ? ' ' : mark(id);
      const sample = names.length <= 4 ? `  ${names.sort().join(', ')}` : '';
      console.log(`  ${m} ${id.padEnd(20)} ${String(names.length).padStart(3)} agent${names.length > 1 ? 's' : ''}${sample}`);
    }
  } else {
    console.log('\nno kf-* agents found — run kiro-flow init.');
  }

  if (avail == null) {
    console.log('\n· could not run `kiro-cli chat --list-models` — availability unverified (is kiro-cli installed?).');
    return 0;
  }
  const missing = [...pins.keys()].filter((id) => id !== '(auto)' && !avail.has(id));
  const tierMissing = TIER_ORDER.filter((t) => map[t] && !avail.has(map[t])).map((t) => map[t]);
  const bad = [...new Set([...missing, ...tierMissing])];
  if (bad.length) {
    console.log(`\n⚠ not offered by this Kiro: ${bad.join(', ')}`);
    console.log(`  edit ${MODEL_MAP_REL} (e.g. set a tier to one of: ${[...avail].slice(0, 6).join(', ')}…) and rerun kiro-flow init.`);
    return 1;
  }
  console.log('\n✓ every routed model is offered by this Kiro.');
  return 0;
}
