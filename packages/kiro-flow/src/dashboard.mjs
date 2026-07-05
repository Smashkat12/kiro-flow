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
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { readLedger, summarize, creditUsd } from './cost.mjs';

const execFileP = promisify(execFile);

export const DASHBOARD_REL = join('.kiro', 'kiro-flow', 'dashboard.html');
const SESSIONS_BRIDGE_REL = join('.claude-flow', 'kiro-flow', 'kiro-sessions.json');
/** Cached Q-Learning router telemetry — the LIVE learning signal (ruflo's
 *  `route stats`). learning.json is a near-static snapshot; the Q-router's
 *  updateCount / qTableSize / epsilon-decay / avgTDError actually move as the
 *  routing intelligence learns, so the dashboard reads a cached copy of it. */
export const ROUTER_STATS_REL = join('.claude-flow', 'metrics', 'router-stats.json');
const RUFLO_SPEC = process.env.KIRO_FLOW_RUFLO_SPEC || 'ruflo@~3.23.0';

/** Refresh the cached router stats by shelling out to `ruflo route stats --json`.
 *  Async + off the poll path (slow npx spawn); best-effort. */
export async function refreshRouterStats(dir, { timeout = 25000 } = {}) {
  try {
    const { stdout } = await execFileP('npx', ['-y', RUFLO_SPEC, 'route', 'stats', '--json'],
      { cwd: dir, timeout, maxBuffer: 8 * 1024 * 1024 });
    const j = stdout.slice(stdout.indexOf('{'));
    const s = (JSON.parse(j).stats) ?? JSON.parse(j);
    const out = {
      updateCount: s.updateCount ?? 0, qTableSize: s.qTableSize ?? 0,
      epsilon: s.epsilon ?? null, avgTDError: s.avgTDError ?? null,
      totalExperiences: s.totalExperiences ?? 0, ts: new Date().toISOString(),
    };
    const p = join(dir, ROUTER_STATS_REL);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(out, null, 2));
    return out;
  } catch { return readRouterStats(dir); }
}

/** Read the cached router stats (fast, for live polls). null if never captured. */
export function readRouterStats(dir) {
  try { return JSON.parse(readFileSync(join(dir, ROUTER_STATS_REL), 'utf8')); } catch { return null; }
}

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

  // learning / metrics — learning.json (near-static) + the LIVE Q-router stats
  data.learning = readJson(join(dir, '.claude-flow', 'metrics', 'learning.json'));
  data.router = readRouterStats(dir);
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

const STYLE = `
:root{--bg:#f6f7f9;--panel:#fff;--ink:#1a1d21;--muted:#6b7280;--line:#e5e7eb;--accent:#4f46e5;--core:#0891b2;--coord:#7c3aed}
@media(prefers-color-scheme:dark){:root{--bg:#0d1117;--panel:#161b22;--ink:#e6edf3;--muted:#8b949e;--line:#30363d;--accent:#7c8cff;--core:#22d3ee;--coord:#a78bfa}}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink)}
header{padding:20px 24px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:4px 16px;align-items:baseline}
header h1{font-size:18px;margin:0}header .path{color:var(--muted);font-family:ui-monospace,monospace;font-size:12px}
header .ts{margin-left:auto;color:var(--muted);font-size:12px;display:flex;align-items:center}
.live-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:6px;animation:pulse 1.6s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
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
.bar-fill{display:block;height:100%;background:var(--accent);border-radius:5px;transition:width .4s ease}.bar-val{font-size:12px;font-variant-numeric:tabular-nums}
.mini{display:inline-block;margin:0 18px 8px 0}.mini b{font-size:20px;display:block}.mini span{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.scroll{overflow-x:auto}#flt{margin-bottom:10px;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);width:220px}
footer{color:var(--muted);font-size:12px;text-align:center;padding:16px}`;

/** The inner content of <main> — recomputed on every poll in serve mode. */
export function renderBody(data) {
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
  const pct = (v) => (typeof v === 'number' ? `${(v * (v <= 1 ? 100 : 1)).toFixed(0)}%` : null);
  const r = data.router;
  // Lead with the LIVE Q-Learning router signal (updateCount / qTable / epsilon
  // decay / avgTDError all move as it learns); learning.json fields fill in.
  const stats = r ? [
    ['Q-updates', r.updateCount || null],
    ['Q-table', r.qTableSize || null],
    ['exploration ε', typeof r.epsilon === 'number' ? r.epsilon.toFixed(2) : null],
    ['TD-error ↓', typeof r.avgTDError === 'number' ? r.avgTDError.toFixed(2) : null],
    ['experiences', r.totalExperiences || null],
  ] : [
    ['patterns', patTotal || null],
    ['pattern quality', pat.quality != null ? pct(pat.quality) : null],
    ['routing acc.', pct(learn.routing?.accuracy ?? learn.routingAccuracy)],
    ['sessions', learn.sessions?.total ?? null],
    ['pending insights', data.memory.pendingInsights || null],
  ];
  const learnStats = stats
    .filter(([, v]) => v != null && v !== '' && typeof v !== 'object')
    .map(([k, v]) => `<div class="mini"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')
    + (r ? `<p class="muted" style="margin:8px 0 0">Q-Learning router · exploration decays as it learns · lower TD-error = converging${r.ts ? ` · updated ${esc(r.ts.slice(11, 19))}` : ''}</p>` : '')
    || '<p class="muted">no learning metrics yet — drive routing with <code>ruflo route feedback</code></p>';

  return `
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

  <footer>kiro-flow local dashboard · read-only telemetry</footer>`;
}

/**
 * Full HTML page. Static mode writes a snapshot; live mode (serve) adds a small
 * same-origin poller that swaps <main> every `interval`s from /api/fragment.
 */
export function renderDashboardHtml(data, { live = false, interval = 3 } = {}) {
  const headerRight = live
    ? `<span class="ts"><span class="live-dot"></span>live · every ${interval}s · updated <span id="live-ts">${esc(data.generatedAt.slice(11, 19))}</span></span>`
    : `<span class="ts">snapshot ${esc(data.generatedAt.slice(0, 19).replace('T', ' '))} · re-run <code>kiro-flow dashboard</code> to refresh</span>`;
  const poller = live ? `<script>(function(){var I=${interval * 1000};async function tick(){try{var r=await fetch('/api/fragment',{cache:'no-store'});if(!r.ok)return;var html=await r.text();var app=document.getElementById('app');var f=document.getElementById('flt');var fv=f?f.value:'';app.innerHTML=html;var nf=document.getElementById('flt');if(nf){nf.value=fv;nf.dispatchEvent(new Event('input'));}var ts=document.getElementById('live-ts');if(ts)ts.textContent=new Date().toTimeString().slice(0,8);}catch(e){}}setInterval(tick,I);})();</script>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>kiro-flow dashboard</title>
<style>${STYLE}</style></head><body>
<header><h1>kiro-flow</h1><span class="path">${esc(data.workspace)}</span>${headerRight}</header>
<main id="app">${renderBody(data)}</main>${poller}</body></html>`;
}

function tryOpen(path) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try { execFile(opener, [path], () => {}); return true; } catch { return false; }
}

/**
 * Live mode: a loopback-only HTTP server that re-reads the workspace on each
 * request. Binds 127.0.0.1 exclusively — never network-exposed. Serves the page
 * at `/`, a fresh body fragment at `/api/fragment` (what the poller swaps), and
 * the raw snapshot at `/api/data`. Resolves its exit code on SIGINT.
 */
/** The (not-yet-listening) http.Server that re-reads `dir` per request. Exported
 *  so an integration test can listen on an ephemeral port and close it. */
export function createDashboardServer(dir, interval = 3) {
  return createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    try {
      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(renderDashboardHtml(collectDashboardData(dir), { live: true, interval }));
      } else if (url === '/api/fragment') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(renderBody(collectDashboardData(dir)));
      } else if (url === '/api/data') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(collectDashboardData(dir)));
      } else {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
      }
    } catch (e) { res.writeHead(500, { 'content-type': 'text/plain' }); res.end(String(e.message)); }
  });
}

export function serveDashboard({ dir, port = 4173, interval = 3, open = false, host = '127.0.0.1', router = true }) {
  return new Promise((resolve) => {
    const server = createDashboardServer(dir, interval);
    // Refresh the Q-router telemetry off the request path (npx spawn is slow) —
    // once on start, then on a slow cadence; polls just read the cached file.
    let routerTimer = null;
    if (router) {
      const refresh = () => { refreshRouterStats(dir).catch(() => {}); };
      refresh();
      routerTimer = setInterval(refresh, Math.max(interval * 1000 * 4, 20000));
      if (routerTimer.unref) routerTimer.unref();
    }
    server.on('error', (e) => {
      console.error(`kiro-flow dashboard --serve: ${e.code === 'EADDRINUSE' ? `port ${port} already in use — try --port <n>` : e.message}`);
      resolve(1);
    });
    server.listen(port, host, () => {
      const urlStr = `http://${host}:${port}/`;
      console.log(`kiro-flow dashboard (live) → ${urlStr}`);
      console.log(`  refreshes every ${interval}s · bound to ${host} (loopback only, not network-exposed) · Ctrl-C to stop`);
      if (open) tryOpen(urlStr);
    });
    const stop = () => { if (routerTimer) clearInterval(routerTimer); server.close(); console.log('\ndashboard stopped'); resolve(0); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}

/** CLI: `kiro-flow dashboard [--serve [--port N] [--interval N]] [--out <file>] [--open] [--json] [--no-router]`. */
export async function dashboardCommand({ dir, out, open = false, json = false, serve = false, port = 4173, interval = 3, router = true }) {
  if (serve) return serveDashboard({ dir, port, interval, open, router });
  if (router) await refreshRouterStats(dir);   // snapshot: capture fresh Q-router telemetry
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
  else console.log(`  open it:  xdg-open ${target}   ·   live view:  kiro-flow dashboard --serve`);
  return 0;
}
