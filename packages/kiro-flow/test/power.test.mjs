/** M10 tests: power bundle assembly. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { powerPackCommand } from '../src/power.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = join(here, '..', '..', '..', 'schemas', 'kiro-agent.schema.json');

test('power pack: complete bundle, schema-valid agents, keyworded card', () => {
  const out = mkdtempSync(join(tmpdir(), 'kf-m10-'));
  try {
    assert.equal(powerPackCommand({ out }), 0);
    for (const f of [
      'POWER.md', 'README.md', 'mcp.json', 'steering/ruflo.md',
      'agents/kf-orchestrator.json', 'agents/kf-queen.json',
      'agents/kf-deep-researcher.json', 'agents/kf-judge.json',
      'agents/prompts/kf-orchestrator.md', 'agents/prompts/kf-queen.md',
      'agents/prompts/kf-deep-researcher.md',
    ]) assert.ok(existsSync(join(out, f)), `missing ${f}`);

    const card = readFileSync(join(out, 'POWER.md'), 'utf8');
    assert.match(card, /^---\nname: kiro-flow/);
    assert.match(card, /keywords: \[.*swarm.*\]/);

    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA, 'utf8')));
    for (const a of ['kf-orchestrator', 'kf-queen', 'kf-deep-researcher', 'kf-judge']) {
      const agent = JSON.parse(readFileSync(join(out, 'agents', `${a}.json`), 'utf8'));
      assert.ok(validate(agent), `${a}: ${JSON.stringify(validate.errors)}`);
    }
    // the claude-flow server block must match the canonical template
    assert.deepEqual(
      JSON.parse(readFileSync(join(out, 'mcp.json'), 'utf8')).mcpServers['claude-flow'].command,
      'npx',
    );
  } finally { rmSync(out, { recursive: true, force: true }); }
});
