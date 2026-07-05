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
 * @returns {Promise<{checks: Array, failed: boolean}>}
 */
export async function runDoctor({ dir, checkMcp = true }) {
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
    add('kiro-auth', 'Kiro authentication', auth.out !== undefined
      ? ok(auth.out.split('\n')[0])
      : warn('not logged in — run `kiro-cli login` (headless mode may additionally need KIRO_API_KEY)'));
  } else {
    add('kiro-cli', 'kiro-cli installed', fail('not found — install from kiro.dev/downloads (interactive-only dev at home is fine: converted agents + MCP config still work in the IDE)'));
    add('kiro-auth', 'Kiro authentication', skip('kiro-cli missing'));
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
