#!/usr/bin/env node
/**
 * M0/M1 smoke test: verifies the published ruflo MCP server works over stdio
 * exactly as Kiro will consume it (`npx -y ruflo mcp start`).
 *
 * Checks: initialize handshake → tools/list (count + expected tools present)
 *         → memory_store → memory_search round-trip.
 *
 * Usage: node scripts/mcp-smoke.mjs [--cmd "npx -y ruflo mcp start"] [--min-tools 250]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const CMD = argOf('--cmd', 'npx -y ruflo mcp start');
const MIN_TOOLS = Number(argOf('--min-tools', '250'));
const TIMEOUT_MS = Number(argOf('--timeout', '120000'));

const workspace = join(root, 'test-workspace', 'mcp-smoke');
mkdirSync(workspace, { recursive: true });

const [cmd, ...cmdArgs] = CMD.split(/\s+/);
const child = spawn(cmd, cmdArgs, {
  cwd: workspace,
  env: { ...process.env, CLAUDE_FLOW_CWD: workspace },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stderrTail = [];
child.stderr.on('data', (d) => {
  stderrTail.push(d.toString());
  if (stderrTail.length > 40) stderrTail.shift();
});

// Newline-delimited JSON-RPC reader
let buf = '';
const pending = new Map(); // id -> {resolve, reject}
child.stdout.on('data', (d) => {
  buf += d.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line || !line.startsWith('{')) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // non-JSON noise on stdout is itself a finding, but tolerate
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  }
});

let nextId = 1;
function rpc(method, params = {}) {
  const id = nextId++;
  const p = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${method} (id ${id})`));
      }
    }, TIMEOUT_MS);
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return p;
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

try {
  const init = await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'kiro-flow-smoke', version: '0.1.0' },
  });
  check('initialize', !!init?.serverInfo, `server: ${init?.serverInfo?.name} ${init?.serverInfo?.version ?? ''}`);

  const list = await rpc('tools/list');
  const tools = list?.tools ?? [];
  check(`tools/list >= ${MIN_TOOLS}`, tools.length >= MIN_TOOLS, `${tools.length} tools`);

  const names = new Set(tools.map((t) => t.name));
  for (const expected of ['memory_store', 'memory_search', 'swarm_init', 'agent_spawn']) {
    // tolerate namespaced variants
    const hit = names.has(expected) || [...names].some((n) => n.endsWith(expected));
    check(`tool present: ${expected}`, hit, hit ? '' : 'not found in tools/list');
  }

  const key = `kiro-flow-smoke-${Date.now()}`;
  const storeName = names.has('memory_store') ? 'memory_store' : [...names].find((n) => n.endsWith('memory_store'));
  const searchName = names.has('memory_search') ? 'memory_search' : [...names].find((n) => n.endsWith('memory_search'));

  if (storeName && searchName) {
    const store = await rpc('tools/call', {
      name: storeName,
      arguments: { key, value: 'kiro-flow M0 smoke payload', namespace: 'smoke' },
    });
    check('memory_store call', !store?.isError, JSON.stringify(store?.content?.[0] ?? {}).slice(0, 120));

    const search = await rpc('tools/call', {
      name: searchName,
      arguments: { query: key, namespace: 'smoke' },
    });
    const text = JSON.stringify(search?.content ?? '');
    check('memory_search round-trip', !search?.isError && text.includes(key.slice(0, 20)), text.slice(0, 120));
  }
} catch (err) {
  check('smoke run', false, err.message);
} finally {
  child.kill('SIGTERM');
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} checks FAILED`);
  console.error('--- server stderr tail ---\n' + stderrTail.join('').slice(-2000));
  process.exit(1);
}
console.log(`\nAll ${results.length} checks passed.`);
process.exit(0);
