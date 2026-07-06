/**
 * kiro-flow doctor — is this workspace ready to run ruflo on Kiro?
 *
 * Mirrors `ruflo doctor`'s spirit (node/npm/config/db checks) but replaces
 * Claude Code checks with Kiro ones: kiro-cli presence, auth probe, MCP
 * registration + live handshake. Degrades gracefully — every check reports
 * ok/warn/fail/skip with a detail string; exit is 1 only on `fail`.
 */
import { execFileSync, spawn } from 'node:child_process';
import { accessSync, constants as fsConstants, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { installedSkillsCost } from './convert/skills.mjs';

/**
 * Warn only when installed skills auto-load past this. Calibrated for the
 * large windows of Sonnet / Opus 4.8 (the employer's models): the full
 * published skill set (~137k) sits under this and reports ok — the warn is
 * for genuinely excessive loads (e.g. + plugin skills) that would crowd even a
 * big window. Override via KIRO_FLOW_SKILLS_WARN.
 */
const SKILLS_TOKEN_WARN = Number(process.env.KIRO_FLOW_SKILLS_WARN) || 150_000;

const ok = (detail) => ({ status: 'ok', detail });
const warn = (detail) => ({ status: 'warn', detail });
const fail = (detail) => ({ status: 'fail', detail });
const skip = (detail) => ({ status: 'skip', detail });

function tryExec(cmd, args, timeout = 15_000) {
  try {
    return { out: execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] }).trim() };
  } catch (err) {
    return { err };
  }
}

/** Parse `kiro-cli chat --list-models` output into the set of available model ids. */
export function parseModels(out) {
  const ids = new Set();
  for (const line of out.split('\n')) {
    const m = /^\s*\*?\s*([a-z0-9][a-z0-9.-]*)\s+[\d.]+x\b/.exec(line);
    if (m) ids.add(m[1]);
  }
  return ids;
}

/** kf-*.json agents in a dir whose `model` field pins a concrete id (not auto). */
function pinnedModels(agentsDir) {
  const byModel = new Map(); // id -> [agent name]
  if (!existsSync(agentsDir)) return byModel;
  for (const f of readdirSync(agentsDir).filter((n) => n.startsWith('kf-') && n.endsWith('.json'))) {
    try {
      const a = JSON.parse(readFileSync(join(agentsDir, f), 'utf8'));
      if (a.model && a.model !== 'auto') (byModel.get(a.model) ?? byModel.set(a.model, []).get(a.model)).push(a.name ?? f);
    } catch { /* covered by the agents check */ }
  }
  return byModel;
}

function readMcpConfig(dir) {
  for (const p of [join(dir, 'mcp.json'), join(dir, '.kiro', 'settings', 'mcp.json')]) {
    if (!existsSync(p)) continue;
    try {
      const server = JSON.parse(readFileSync(p, 'utf8')).mcpServers?.['claude-flow'];
      if (server) return { path: p, server };
    } catch { /* fall through */ }
  }
  return null;
}

/** Minimal stdio JSON-RPC round-trip against the configured MCP server. */
export function mcpHandshake(server, cwd, timeoutMs = 120_000) {
  return new Promise((resolve) => {
    const child = spawn(server.command, server.args ?? [], {
      cwd,
      env: { ...process.env, ...(server.env ?? {}) },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const timer = setTimeout(() => { child.kill('SIGTERM'); resolve({ error: `timeout after ${timeoutMs}ms` }); }, timeoutMs);
    let buf = '';
    const pending = new Map();
    let id = 0;
    const rpc = (method, params = {}) => new Promise((res) => {
      pending.set(++id, res);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('{')) continue;
        try {
          const msg = JSON.parse(line);
          pending.get(msg.id)?.(msg);
          pending.delete(msg.id);
        } catch { /* ignore non-JSON lines */ }
      }
    });
    child.on('error', (err) => { clearTimeout(timer); resolve({ error: String(err) }); });
    (async () => {
      const init = await rpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'kiro-flow-doctor', version: '0' },
      });
      const list = await rpc('tools/list');
      clearTimeout(timer);
      child.kill('SIGTERM');
      resolve({
        serverInfo: init.result?.serverInfo,
        toolCount: list.result?.tools?.length ?? 0,
      });
    })();
  });
}

/**
 * @param {object} opts
 * @param {string} opts.dir
 * @param {boolean} [opts.checkMcp=true]  live MCP handshake (slow on cold npx cache)
 * @param {boolean} [opts.checkHeadless=true]  spend one real kiro-cli turn to
 *   prove the headless (shim/daemon/worker) auth path works — the work-laptop
 *   SSO blocker. Disable with --no-headless to skip the credit + latency.
 * @returns {Promise<{checks: Array, failed: boolean}>}
 */
export async function runDoctor({ dir, checkMcp = true, checkHeadless = true }) {
  const checks = [];
  const add = (id, label, result) => checks.push({ id, label, ...result });

  // node
  const major = Number(process.versions.node.split('.')[0]);
  add('node', 'Node.js >= 20', major >= 20 ? ok(`v${process.versions.node}`) : fail(`v${process.versions.node} — need 20+`));

  // npm
  const npm = tryExec('npm', ['--version']);
  add('npm', 'npm available', npm.out ? ok(`v${npm.out}`) : fail('npm not found on PATH'));

  // kiro-cli
  const kiro = tryExec('kiro-cli', ['--version']);
  if (kiro.out) {
    add('kiro-cli', 'kiro-cli installed', ok(kiro.out));
    // auth probe — `kiro-cli whoami` verified against kiro-cli 2.10.0
    const auth = tryExec('kiro-cli', ['whoami']);
    const loggedIn = auth.out !== undefined;
    add('kiro-auth', 'Kiro authentication', loggedIn
      ? ok(auth.out.split('\n')[0])
      : warn('not logged in — run `kiro-cli login` (headless mode may additionally need KIRO_API_KEY)'));

    // headless auth probe — the actual work-laptop blocker. `whoami` passing
    // only proves the *interactive* SSO session is live; the shim/daemon/worker
    // plane runs `kiro-cli chat --no-interactive` (see shim/claude:89), which on
    // a governed laptop can fail even when interactive auth works. Spend one
    // real minimal turn on that exact path so doctor reports the gap directly
    // rather than the user discovering it when a background worker silently dies.
    if (checkHeadless && loggedIn) {
      const probe = tryExec('kiro-cli', ['chat', '--no-interactive', 'reply with the single word: ok'], 60_000);
      if (probe.out !== undefined) {
        add('kiro-headless', 'Headless turns (shim/daemon/worker)',
          ok('`kiro-cli chat --no-interactive` succeeds — the background worker plane will run'));
      } else {
        const why = (probe.err?.stderr || probe.err?.message || String(probe.err ?? '')).split('\n')[0].slice(0, 120);
        add('kiro-headless', 'Headless turns (shim/daemon/worker)',
          warn(`interactive auth OK but \`kiro-cli chat --no-interactive\` failed (${why}) — the headless plane (kiro-flow daemon/worker) needs KIRO_API_KEY or a headless-capable login; interactive IDE/CLI use is unaffected`));
      }
    } else if (checkHeadless) {
      add('kiro-headless', 'Headless turns (shim/daemon/worker)', skip('not logged in — resolve kiro-auth first'));
    } else {
      add('kiro-headless', 'Headless turns (shim/daemon/worker)', skip('disabled (--no-headless)'));
    }
  } else {
    add('kiro-cli', 'kiro-cli installed', fail('not found — install from kiro.dev/downloads (interactive-only dev at home is fine: converted agents + MCP config still work in the IDE)'));
    add('kiro-auth', 'Kiro authentication', skip('kiro-cli missing'));
    add('kiro-headless', 'Headless turns (shim/daemon/worker)', skip('kiro-cli missing'));
  }

  // MCP registration
  const mcp = readMcpConfig(dir);
  add('mcp-config', 'claude-flow MCP server registered', mcp
    ? ok(`${mcp.path} → ${mcp.server.command} ${(mcp.server.args ?? []).join(' ')}`)
    : fail('no mcp.json / .kiro/settings/mcp.json with a claude-flow server — run kiro-flow init'));

  // MCP handshake
  if (mcp && checkMcp) {
    const hs = await mcpHandshake(mcp.server, dir);
    if (hs.error) add('mcp-handshake', 'MCP server handshake', fail(hs.error));
    else if (hs.toolCount >= 250) add('mcp-handshake', 'MCP server handshake', ok(`${hs.serverInfo?.name ?? '?'} ${hs.serverInfo?.version ?? ''} — ${hs.toolCount} tools`));
    else add('mcp-handshake', 'MCP server handshake', warn(`only ${hs.toolCount} tools listed (expected ≥250) — wrong package or partial registration`));
  } else {
    add('mcp-handshake', 'MCP server handshake', skip(mcp ? 'disabled (--no-mcp)' : 'no server configured'));
  }

  // memory db
  const db = join(dir, '.swarm', 'memory.db');
  add('memory-db', 'ruflo memory database', existsSync(db)
    ? ok(db)
    : warn('.swarm/memory.db not created yet — appears after the first memory_store call'));

  // converted agents
  const agentsDir = join(dir, '.kiro', 'agents');
  if (existsSync(agentsDir)) {
    const files = readdirSync(agentsDir).filter((f) => f.startsWith('kf-') && f.endsWith('.json'));
    let broken = 0;
    for (const f of files) {
      try {
        const a = JSON.parse(readFileSync(join(agentsDir, f), 'utf8'));
        if (!a.name || !a.description) broken++;
      } catch { broken++; }
    }
    add('agents', 'converted kf-* agents', files.length === 0
      ? fail('no kf-*.json in .kiro/agents — run kiro-flow init (or convert agents)')
      : broken ? fail(`${broken}/${files.length} agent files unparsable/invalid`) : ok(`${files.length} agents`));
  } else {
    add('agents', 'converted kf-* agents', fail('.kiro/agents missing — run kiro-flow init'));
  }

  // model routing (M11 #3): every pinned model must exist in this Kiro's list
  const pinned = pinnedModels(agentsDir);
  if (pinned.size === 0) {
    add('models', 'agent model routing', skip('no agents pin a model — all inherit session/auto'));
  } else if (!kiro.out) {
    add('models', 'agent model routing', warn(`${pinned.size} model(s) pinned but kiro-cli missing — cannot verify availability`));
  } else {
    const models = tryExec('kiro-cli', ['chat', '--list-models']);
    if (models.out === undefined) {
      add('models', 'agent model routing', skip('kiro-cli chat --list-models unavailable on this version'));
    } else {
      const avail = parseModels(models.out);
      const bad = [...pinned].filter(([id]) => !avail.has(id));
      add('models', 'agent model routing', bad.length === 0
        ? ok(`${pinned.size} model(s) pinned, all offered by kiro-cli`)
        : warn(`${bad.map(([id, ags]) => `${id} (${ags.length} agent${ags.length > 1 ? 's' : ''})`).join('; ')} not in kiro-cli --list-models — edit ${join('.kiro', 'kiro-flow', 'model-map.json')} and rerun kiro-flow init`));
    }
  }

  // skills always-on cost (M11 resources pass): every installed .kiro/skills
  // SKILL.md auto-loads into every agent, so flag when it crowds the window
  const skills = installedSkillsCost(dir);
  const kTok = Math.round(skills.tokens / 1000);
  if (skills.count === 0) {
    add('skills', 'skills always-on cost', skip('none installed — kiro-flow skills add --core|--all'));
  } else if (skills.tokens <= SKILLS_TOKEN_WARN) {
    add('skills', 'skills always-on cost', ok(`${skills.count} installed → ~${kTok}k tokens auto-loaded into every agent (fine on Sonnet/Opus 4.8's window)`));
  } else {
    add('skills', 'skills always-on cost', warn(`${skills.count} installed → ~${kTok}k tokens auto-loaded into EVERY agent (crowds even a large window; trim with 'kiro-flow skills remove --all && kiro-flow skills add --core', or remove individually)`));
  }

  // hook plumbing: agents reference the adapter; adapter delegates to ruflo's helpers
  const adapterPath = join(dir, '.kiro', 'kiro-flow', 'kiro-hook-adapter.cjs');
  const handlerPath = join(dir, '.claude', 'helpers', 'hook-handler.cjs');
  const agentsReferenceAdapter = existsSync(join(dir, '.kiro', 'agents'))
    && readdirSync(join(dir, '.kiro', 'agents')).some((f) => {
      if (!f.endsWith('.json')) return false;
      try { return JSON.stringify(JSON.parse(readFileSync(join(dir, '.kiro', 'agents', f), 'utf8')).hooks ?? {}).includes('kiro-hook-adapter'); } catch { return false; }
    });
  if (agentsReferenceAdapter) {
    add('hooks', 'hook adapter + ruflo handlers', existsSync(adapterPath)
      ? (existsSync(handlerPath)
        ? ok(`${adapterPath} → .claude/helpers/hook-handler.cjs`)
        : warn('.claude/helpers/hook-handler.cjs missing — hooks will no-op (run kiro-flow init to restore ruflo helpers)'))
      : fail('.kiro/kiro-flow/kiro-hook-adapter.cjs missing but agents reference it — run kiro-flow init'));
  } else {
    add('hooks', 'hook adapter + ruflo handlers', skip('no agent hooks configured'));
  }

  // headless executor: shim present + executable, and a backend to route to
  const shim = join(dir, '.kiro', 'kiro-flow', 'shim', 'claude');
  if (existsSync(shim)) {
    let executable = false;
    try { accessSync(shim, fsConstants.X_OK); executable = true; } catch { /* not executable */ }
    if (!executable) {
      add('executor', 'kiro-claude-shim (headless workers)', fail(`${shim} is not executable — chmod +x or rerun kiro-flow init`));
    } else if (kiro.out) {
      add('executor', 'kiro-claude-shim (headless workers)', ok(`${shim} → kiro-cli (use: kiro-flow daemon start)`));
    } else {
      add('executor', 'kiro-claude-shim (headless workers)', warn('shim installed but kiro-cli missing — workers can only run with --executor claude|mock'));
    }
  } else {
    add('executor', 'kiro-claude-shim (headless workers)', skip('not installed — run kiro-flow init (needed only for the background worker plane)'));
  }

  return { checks, failed: checks.some((c) => c.status === 'fail') };
}

export function formatDoctorReport(checks) {
  const icon = { ok: '✓', warn: '⚠', fail: '✗', skip: '·' };
  return checks.map((c) => `${icon[c.status]} ${c.label}: ${c.detail}`).join('\n');
}
