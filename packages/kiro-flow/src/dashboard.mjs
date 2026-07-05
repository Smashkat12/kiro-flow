/**
 * kiro-flow dashboard — a local, read-only telemetry view.
 *
 * ruflo's live agent dashboard (goal.ruv.io/agents) is a hosted web app tied to
 * its own model providers — N-A on a governed Kiro laptop (dossier 10). But the
 * signals it visualizes are all produced locally by the stack we run: the M14
 * cost ledger, the converted agent roster, the learning/swarm metrics, hive
 * state, the daemon, and the session bridge. This rebuild reads those files and
 * renders ONE self-contained HTML page (no server, no Docker, no external
 * fonts/scripts/network — safe to open on a locked-down machine). Re-run to
 * refresh; it is a point-in-time snapshot, never a live socket.
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readLedger, summarize, creditUsd } from './cost.mjs';

export const DASHBOARD_REL = join('.kiro', 'kiro-flow', 'dashboard.html');
const SESSIONS_BRIDGE_REL = join('.claude-flow', 'kiro-flow', 'kiro-sessions.json');

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const countLines = (p) => { try { return readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).length; } catch { return 0; } };
const safeStat = (p) => { try { const s = statSync(p); return { exists: true, size: s.size, mtime: s.mtimeMs }; } catch { return { exists: false }; } };
const fmtBytes = (n) => (n == null ? '—' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** Gather every local signal into one plain snapshot object. Best-effort — a
 *  missing/corrupt file degrades to null/empty, never throws. */
export function collectDashboardData(dir, { now = Date.now() } = {}) {
  const data = { workspace: dir, generatedAt: new Date(now).toISOString() };

  // agents (+ manifest for core/profile/category)
  const agentsDir = join(dir, '.kiro', 'agents');
  const manifest = readJson(join(dir, '.kiro', 'kiro-flow', 'agents-manifest.json')) ?? [];
  const meta = new Map(manifest.map((m) => [m.name, m]));
  const agents = [];
  if (existsSync(agentsDir)) {
    for (const f of readdirSync(agentsDir)) {
      if (!f.endsWith('.json')) continue;
      const j = readJson(join(agentsDir, f));
      if (!j?.name) continue;
      const m = meta.get(j.name) ?? {};
      agents.push({
        name: j.name,
        model: j.model ?? 'auto',
        description: j.description ?? '',
        tools: Array.isArray(j.tools) ? j.tools.length : 0,
        coordinator: !!j.toolsSettings?.subagent,
        roster: j.toolsSettings?.subagent?.availableAgents?.length ?? 0,
        core: !!m.core,
        profile: m.profile ?? null,
        category: m.category ?? null,
      });
    }
  }
  agents.sort((a, b) => (b.core - a.core) || a.name.localeCompare(b.name));
  data.agents = agents;

  // plugins
  data.plugins = readJson(join(dir, '.kiro', 'kiro-flow', 'plugins.json'))?.enabled ?? [];

  // cost (M14 ledger)
  const rows = readLedger(dir);
  data.cost = { ...summarize(rows, { now }), recent: rows.slice(-12).reverse() };

  // memory
  data.memory = safeStat(join(dir, '.swarm', 'memory.db'));
  const autoMem = readJson(join(dir, '.claude-flow', 'data', 'auto-memory-store.json'));
  data.memory.autoEntries = autoMem ? (Array.isArray(autoMem) ? autoMem.length : Object.keys(autoMem).length) : 0;
  data.memory.pendingInsights = countLines(join(dir, '.claude-flow', 'data', 'pending-insights.jsonl'));

  // learning / metrics
  data.learning = readJson(join(dir, '.claude-flow', 'metrics', 'learning.json'));
  data.swarmActivity = readJson(join(dir, '.claude-flow', 'metrics', 'swarm-activity.json'));

  // hive
  const hive = readJson(join(dir, '.claude-flow', 'hive-mind', 'state.json'));
  const hiveSessDir = join(dir, '.hive-mind', 'sessions');
  const hiveFiles = existsSync(hiveSessDir) ? readdirSync(hiveSessDir).filter((f) => f.endsWith('.txt')) : [];
  data.hive = {
    present: !!hive,
    sharedMemoryKeys: hive?.sharedMemory ? Object.keys(hive.sharedMemory).length : 0,
    sessions: hiveFiles.length,
    consensus: hive?.consensus ?? hive?.consensusAlgorithm ?? null,
  };

  // swarm
  const swarm = readJson(join(dir, '.swarm', 'state.json')) ?? readJson(join(dir, '.claude-flow', 'swarm', 'swarm-state.json'));
  data.swarm = swarm ? {
    topology: swarm.topology ?? swarm.config?.topology ?? null,
    agents: swarm.agents ? (Array.isArray(swarm.agents) ? swarm.agents.length : Object.keys(swarm.agents).length) : 0,
    tasks: swarm.tasks ? (Array.isArray(swarm.tasks) ? swarm.tasks.length : Object.keys(swarm.tasks).length) : 0,
  } : null;

  // daemon
  const daemon = readJson(join(dir, '.claude-flow', 'daemon-state.json'));
  data.daemon = daemon ? { running: daemon.running ?? daemon.status === 'running' ?? false, pid: daemon.pid ?? null, status: daemon.status ?? null } : null;

  // session bridge (M7)
  const bridge = readJson(join(dir, SESSIONS_BRIDGE_REL));
  data.sessions = bridge?.sessions ? Object.keys(bridge.sessions).length : 0;

  return data;
}

// ── rendering (server-side; self-contained HTML) ──

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtCred = (c) => (c ?? 0).toFixed(2);

function bars(obj, usd) {
  const entries = Object.entries(obj ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '<p class="muted">no data</p>';
  const max = Math.max(...entries.map(([, v]) => v));
  return entries.map(([k, v]) => `
    <div class="bar-row">
      <span class="bar-label">${esc(k)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.max(3, (v / max) * 100).toFixed(1)}%"></span></span>
      <span class="bar-val">${fmtCred(v)}${usd ? ` <span class="muted">$${(v * usd).toFixed(2)}</span>` : ''}</span>
    </div>`).join('');
}

function card(label, value, sub) {
  return `<div class="card"><div class="card-val">${esc(value)}</div><div class="card-label">${esc(label)}</div>${sub ? `<div class="card-sub">${esc(sub)}</div>` : ''}</div>`;
}

export function renderDashboardHtml(data) {
  const c = data.cost ?? {};
  const usd = c.usdPerCredit ?? creditUsd();
  const coreCount = data.agents.filter((a) => a.core).length;
  const coordCount = data.agents.filter((a) => a.coordinator).length;

  const overview = [
    card('agents', String(data.agents.length), `${coreCount} core · ${coordCount} coordinators`),
    card('plugins enabled', String(data.plugins.length), data.plugins.map((p) => p.replace(/^ruflo-/, '')).join(', ') || 'none'),
    card('credits spent', fmtCred(c.total), usd != null ? `$${((c.total ?? 0) * usd).toFixed(2)} · ${c.count ?? 0} calls` : `${c.count ?? 0} calls`),
    card('memory.db', data.memory.exists ? fmtBytes(data.memory.size) : '—', data.memory.exists ? `${data.memory.pendingInsights} pending insights` : 'not created yet'),
    card('hive sessions', String(data.hive.sessions), data.hive.present ? `${data.hive.sharedMemoryKeys} shared keys` : 'no hive state'),
    card('kiro sessions', String(data.sessions), data.daemon?.running ? 'daemon: running' : 'daemon: idle'),
  ].join('');

  const agentRows = data.agents.map((a) => `
    <tr data-name="${esc(a.name)}" data-core="${a.core}">
      <td>${a.core ? '<span class="pill core">core</span> ' : ''}${a.coordinator ? '<span class="pill coord">coord</span> ' : ''}${esc(a.name)}</td>
      <td>${esc(a.model)}</td>
      <td class="muted">${esc(a.category ?? a.profile ?? '')}</td>
      <td class="num">${a.tools}</td>
      <td class="num">${a.coordinator ? a.roster : ''}</td>
      <td class="muted desc">${esc(a.description).slice(0, 90)}</td>
    </tr>`).join('');

  const costRecent = (c.recent ?? []).map((r) => `
    <tr><td class="muted">${esc((r.ts ?? '').slice(0, 19).replace('T', ' '))}</td>
      <td>${esc(r.model ?? 'auto')}</td><td>${esc(r.entrypoint ?? 'worker')}</td>
      <td class="num">${r.credits == null ? '—' : fmtCred(r.credits)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">no invocations logged yet</td></tr>';

  const learn = data.learning ?? {};
  const pat = learn.patterns ?? {};
  const patTotal = (pat.shortTerm ?? 0) + (pat.longTerm ?? 0);
  const acc = learn.routing?.accuracy ?? learn.routingAccuracy;
  const pct = (v) => (typeof v === 'number' ? `${(v * (v <= 1 ? 100 : 1)).toFixed(0)}%` : null);
  const learnStats = [
    ['patterns', patTotal || null],
    ['pattern quality', pat.quality != null ? pct(pat.quality) : null],
    ['routing acc.', pct(acc)],
    ['sessions', learn.sessions?.total ?? null],
    ['pending insights', data.memory.pendingInsights || null],
  ].filter(([, v]) => v != null && v !== '' && typeof v !== 'object')
   .map(([k, v]) => `<div class="mini"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('') || '<p class="muted">no learning metrics yet</p>';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>kiro-flow dashboard</title>
<style>
:root{--bg:#f6f7f9;--panel:#fff;--ink:#1a1d21;--muted:#6b7280;--line:#e5e7eb;--accent:#4f46e5;--core:#0891b2;--coord:#7c3aed}
@media(prefers-color-scheme:dark){:root{--bg:#0d1117;--panel:#161b22;--ink:#e6edf3;--muted:#8b949e;--line:#30363d;--accent:#7c8cff;--core:#22d3ee;--coord:#a78bfa}}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink)}
header{padding:20px 24px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:4px 16px;align-items:baseline}
header h1{font-size:18px;margin:0}header .path{color:var(--muted);font-family:ui-monospace,monospace;font-size:12px}
header .ts{margin-left:auto;color:var(--muted);font-size:12px}
main{max-width:1100px;margin:0 auto;padding:20px 24px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:24px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.card-val{font-size:24px;font-weight:650;letter-spacing:-.02em}.card-label{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em;margin-top:2px}
.card-sub{color:var(--muted);font-size:12px;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin-bottom:20px}
.panel h2{font-size:14px;margin:0 0 12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}@media(max-width:720px){.grid2{grid-template-columns:1fr}}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
th{color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
td.num{text-align:right;font-variant-numeric:tabular-nums}.muted{color:var(--muted)}.desc{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{display:inline-block;font-size:10px;padding:1px 6px;border-radius:20px;font-weight:600;vertical-align:middle}
.pill.core{background:color-mix(in srgb,var(--core) 18%,transparent);color:var(--core)}.pill.coord{background:color-mix(in srgb,var(--coord) 18%,transparent);color:var(--coord)}
.bar-row{display:grid;grid-template-columns:130px 1fr auto;gap:10px;align-items:center;margin:5px 0}
.bar-label{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bar-track{height:8px;background:var(--line);border-radius:5px;overflow:hidden}
.bar-fill{display:block;height:100%;background:var(--accent);border-radius:5px}.bar-val{font-size:12px;font-variant-numeric:tabular-nums}
.mini{display:inline-block;margin:0 18px 8px 0}.mini b{font-size:20px;display:block}.mini span{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.scroll{overflow-x:auto}#flt{margin-bottom:10px;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);width:220px}
footer{color:var(--muted);font-size:12px;text-align:center;padding:16px}
</style></head><body>
<header>
  <h1>kiro-flow</h1><span class="path">${esc(data.workspace)}</span>
  <span class="ts">snapshot ${esc(data.generatedAt.slice(0, 19).replace('T', ' '))} · re-run <code>kiro-flow dashboard</code> to refresh</span>
</header>
<main>
  <div class="cards">${overview}</div>

  <div class="panel">
    <h2>Credit spend${usd != null ? ' (USD @ $' + usd + '/credit)' : ''}</h2>
    <div class="grid2">
      <div><h3 class="muted" style="font-size:12px;margin:0 0 6px">by model</h3>${bars(c.byModel, usd)}
           <h3 class="muted" style="font-size:12px;margin:14px 0 6px">by entrypoint</h3>${bars(c.byEntrypoint, usd)}</div>
      <div><h3 class="muted" style="font-size:12px;margin:0 0 6px">recent invocations</h3>
        <div class="scroll"><table><thead><tr><th>when</th><th>model</th><th>entrypoint</th><th class="num">credits</th></tr></thead><tbody>${costRecent}</tbody></table></div>
      </div>
    </div>
  </div>

  <div class="grid2">
    <div class="panel"><h2>Hive / Swarm</h2>
      <div class="mini"><b>${data.hive.sessions}</b><span>hive sessions</span></div>
      <div class="mini"><b>${data.hive.sharedMemoryKeys}</b><span>shared mem keys</span></div>
      ${data.swarm ? `<div class="mini"><b>${data.swarm.agents}</b><span>swarm agents</span></div><div class="mini"><b>${data.swarm.tasks}</b><span>tasks</span></div>` : ''}
      <p class="muted" style="margin:8px 0 0">${data.hive.consensus ? 'consensus: ' + esc(typeof data.hive.consensus === 'string' ? data.hive.consensus : JSON.stringify(data.hive.consensus).slice(0, 60)) : 'no active hive state'}${data.swarm?.topology ? ' · topology: ' + esc(data.swarm.topology) : ''}</p>
    </div>
    <div class="panel"><h2>Learning</h2>${learnStats}</div>
  </div>

  <div class="panel"><h2>Agents (${data.agents.length})</h2>
    <input id="flt" placeholder="filter by name…" oninput="var q=this.value.toLowerCase();document.querySelectorAll('#atbl tbody tr').forEach(function(r){r.style.display=r.dataset.name.includes(q)?'':'none'})">
    <div class="scroll"><table id="atbl"><thead><tr><th>agent</th><th>model</th><th>profile</th><th class="num">tools</th><th class="num">roster</th><th>role</th></tr></thead>
    <tbody>${agentRows || '<tr><td colspan="6" class="muted">no agents converted yet — run kiro-flow init</td></tr>'}</tbody></table></div>
  </div>

  <footer>kiro-flow local dashboard · read-only snapshot · no network, no server</footer>
</main></body></html>`;
}

function tryOpen(path) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try { execFile(opener, [path], () => {}); return true; } catch { return false; }
}

/** CLI: `kiro-flow dashboard [--out <file>] [--open] [--json]`. Returns exit code. */
export function dashboardCommand({ dir, out, open = false, json = false }) {
  const data = collectDashboardData(dir);
  if (json) { console.log(JSON.stringify(data, null, 2)); return 0; }
  const target = out ?? join(dir, DASHBOARD_REL);
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, renderDashboardHtml(data));
  } catch (e) { console.error(`kiro-flow dashboard: failed to write ${target}: ${e.message}`); return 1; }
  console.log(`dashboard → ${target}`);
  console.log(`  ${data.agents.length} agents · ${data.plugins.length} plugins · ${fmtCred(data.cost.total)} credits · ${data.hive.sessions} hive sessions`);
  if (open) { tryOpen(target); console.log('  opening in your browser…'); }
  else console.log(`  open it:  xdg-open ${target}   (or pass --open)`);
  return 0;
}
