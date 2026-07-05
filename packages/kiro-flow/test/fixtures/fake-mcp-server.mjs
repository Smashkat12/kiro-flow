#!/usr/bin/env node
/** Minimal stdio MCP server for doctor tests: initialize + tools/list (260 tools). */
let buf = '';
process.stdin.on('data', (d) => {
  buf += d.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const result = msg.method === 'initialize'
      ? { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake-ruflo', version: '9.9.9' } }
      : msg.method === 'tools/list'
        ? { tools: Array.from({ length: 260 }, (_, i) => ({ name: `fake_tool_${i}`, inputSchema: { type: 'object' } })) }
        : {};
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\n');
  }
});
