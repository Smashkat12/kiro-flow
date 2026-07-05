#!/usr/bin/env node
/**
 * Dumps the ruflo MCP server's tools/list to JSON + a categorized markdown
 * inventory (dossiers/01-tool-inventory.generated.md). Category = prefix
 * before the first underscore (memory_, swarm_, agent_, …).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workspace = join(root, 'test-workspace', 'mcp-smoke');
mkdirSync(workspace, { recursive: true });

const child = spawn('npx', ['-y', 'ruflo', 'mcp', 'start'], {
  cwd: workspace,
  env: { ...process.env, CLAUDE_FLOW_CWD: workspace },
});

let buf = '';
const pending = new Map();
child.stdout.on('data', (d) => {
  buf += d.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line.startsWith('{')) continue;
    try {
      const msg = JSON.parse(line);
      if (pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {}
  }
});

let id = 0;
const rpc = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, resolve);
    setTimeout(() => reject(new Error(`timeout: ${method}`)), 120000);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n');
  });

await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'dump', version: '0' } });
const { result } = await rpc('tools/list');
child.kill('SIGTERM');

const tools = result.tools;
writeFileSync(join(root, 'dossiers', 'tool-inventory.json'), JSON.stringify(tools, null, 2));

const byCat = new Map();
for (const t of tools) {
  const cat = t.name.includes('_') ? t.name.split('_')[0] : '(other)';
  if (!byCat.has(cat)) byCat.set(cat, []);
  byCat.get(cat).push(t);
}
const cats = [...byCat.entries()].sort((a, b) => b[1].length - a[1].length);

let md = `# Dossier 01 (generated) — ruflo MCP tool inventory\n\n*${tools.length} tools from \`npx -y ruflo mcp start\` tools/list, ruflo v3.23.0.*\n\n## Categories (${cats.length})\n\n| Category | Count |\n|---|---|\n`;
for (const [cat, list] of cats) md += `| ${cat} | ${list.length} |\n`;
md += `\n`;
for (const [cat, list] of cats) {
  md += `\n## ${cat} (${list.length})\n\n| Tool | Description |\n|---|---|\n`;
  for (const t of list.sort((a, b) => a.name.localeCompare(b.name))) {
    md += `| \`${t.name}\` | ${(t.description ?? '').split('\n')[0].slice(0, 140).replaceAll('|', '\\|')} |\n`;
  }
}
writeFileSync(join(root, 'dossiers', '01-tool-inventory.generated.md'), md);
console.log(`${tools.length} tools, ${cats.length} categories`);
console.log(cats.map(([c, l]) => `${c}:${l.length}`).join(' '));
