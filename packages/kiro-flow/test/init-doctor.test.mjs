/** M3 tests: init idempotency + artifact correctness, doctor checks with mocked kiro-cli/MCP. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { initWorkspace, buildOrchestratorAgent } from '../src/init.mjs';
import { runDoctor } from '../src/doctor.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = join(here, '..', '..', '..', 'schemas', 'kiro-agent.schema.json');

function makeFixtureWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), 'kf-m3-'));
  mkdirSync(join(dir, '.claude', 'agents', 'core'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'agents', 'core', 'coder.md'),
    '---\nname: coder\ndescription: writes code\n---\n\nYou are a coder.\n');
  writeFileSync(join(dir, '.claude', 'agents', 'core', 'researcher.md'),
    '---\nname: researcher\ndescription: researches\n---\n\nYou are a researcher.\n');
  return dir;
}

function treeSnapshot(dir, base = dir, out = {}) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) treeSnapshot(p, base, out);
    else out[p.slice(base.length + 1)] = readFileSync(p, 'utf8');
  }
  return out;
}

test('init: produces all Kiro-side artifacts from a fixture workspace', () => {
  const dir = makeFixtureWorkspace();
  try {
    const { steps } = initWorkspace({ dir, skipRufloInit: true });
    assert.equal(steps.find((s) => s.step === 'ruflo init').status, 'skipped');
    for (const f of [
      '.kiro/agents/kf-coder.json',
      '.kiro/agents/prompts/kf-coder.md',
      '.kiro/agents/kf-orchestrator.json',
      '.kiro/agents/prompts/kf-orchestrator.md',
      '.kiro/steering/ruflo.md',
      '.kiro/settings/mcp.json',
      'mcp.json',
      '.kiro/kiro-flow/agents-manifest.json',
      '.kiro/kiro-flow/conversion-report.json',
    ]) {
      assert.ok(statSync(join(dir, f)).isFile(), `missing ${f}`);
    }
    const mcp = JSON.parse(readFileSync(join(dir, 'mcp.json'), 'utf8'));
    assert.equal(mcp.mcpServers['claude-flow'].command, 'npx');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init: double run is a byte-identical no-op', () => {
  const dir = makeFixtureWorkspace();
  try {
    initWorkspace({ dir, skipRufloInit: true });
    const first = treeSnapshot(dir);
    const { steps } = initWorkspace({ dir, skipRufloInit: true });
    assert.deepEqual(treeSnapshot(dir), first);
    // and the writers all report unchanged
    for (const s of steps.filter((x) => ['mcp.json (CLI)', '.kiro/steering/ruflo.md', '.kiro/agents/kf-orchestrator.json'].includes(x.step))) {
      assert.equal(s.status, 'unchanged', `${s.step} rewrote content`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init: merging mcp.json preserves foreign servers', () => {
  const dir = makeFixtureWorkspace();
  try {
    writeFileSync(join(dir, 'mcp.json'), JSON.stringify({
      mcpServers: { github: { command: 'gh-mcp', args: [] } },
    }, null, 2));
    initWorkspace({ dir, skipRufloInit: true });
    const mcp = JSON.parse(readFileSync(join(dir, 'mcp.json'), 'utf8'));
    assert.ok(mcp.mcpServers.github, 'existing github server was clobbered');
    assert.ok(mcp.mcpServers['claude-flow']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('orchestrator agent validates against the Kiro schema and trusts the core 12', () => {
  const agent = buildOrchestratorAgent();
  const ajv = new Ajv2020({ strict: false });
  const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA, 'utf8')));
  assert.ok(validate(agent), JSON.stringify(validate.errors));
  assert.equal(agent.toolsSettings.subagent.availableAgents.length, 12);
  assert.ok(agent.toolsSettings.subagent.availableAgents.every((a) => a.startsWith('kf-')));
  assert.ok(agent.tools.includes('subagent'));
});

test('orchestrator only registers agents that exist in the workspace', () => {
  const dir = makeFixtureWorkspace();
  try {
    initWorkspace({ dir, skipRufloInit: true });
    const orch = JSON.parse(readFileSync(join(dir, '.kiro', 'agents', 'kf-orchestrator.json'), 'utf8'));
    // fixture corpus has only coder + researcher — no phantom trusted agents
    assert.deepEqual(orch.toolsSettings.subagent.availableAgents, ['kf-coder', 'kf-researcher']);
    assert.deepEqual(orch.toolsSettings.subagent.trustedAgents, ['kf-coder', 'kf-researcher']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor: all green with mocked kiro-cli and fake MCP server', async () => {
  const dir = makeFixtureWorkspace();
  const binDir = join(dir, 'fake-bin');
  mkdirSync(binDir);
  const kiroCliPath = join(binDir, 'kiro-cli');
  writeFileSync(kiroCliPath, '#!/bin/sh\ncase "$1" in --version) echo "kiro-cli 1.2.3";; whoami) echo "smash@work (sso)";; *) exit 1;; esac\n');
  chmodSync(kiroCliPath, 0o755);
  const origPath = process.env.PATH;
  process.env.PATH = `${binDir}:${origPath}`;
  try {
    initWorkspace({ dir, skipRufloInit: true });
    // point the workspace at the fake MCP server
    const fake = join(here, 'fixtures', 'fake-mcp-server.mjs');
    writeFileSync(join(dir, 'mcp.json'), JSON.stringify({
      mcpServers: { 'claude-flow': { command: process.execPath, args: [fake] } },
    }, null, 2));
    mkdirSync(join(dir, '.swarm'), { recursive: true });
    writeFileSync(join(dir, '.swarm', 'memory.db'), '');

    const { checks, failed } = await runDoctor({ dir });
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
    assert.equal(byId['kiro-cli'].status, 'ok');
    assert.equal(byId['kiro-auth'].status, 'ok');
    assert.equal(byId['mcp-handshake'].status, 'ok', byId['mcp-handshake'].detail);
    assert.match(byId['mcp-handshake'].detail, /fake-ruflo 9.9.9 — 260 tools/);
    assert.equal(byId['memory-db'].status, 'ok');
    assert.equal(byId.agents.status, 'ok');
    assert.equal(failed, false);
  } finally {
    process.env.PATH = origPath;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor: skills always-on cost reports skip / ok / warn by installed size', async () => {
  const dir = makeFixtureWorkspace();
  const skillDir = (n) => join(dir, '.kiro', 'skills', n);
  const findSkills = (checks) => checks.find((c) => c.id === 'skills');
  try {
    // none installed → skip
    let { checks } = await runDoctor({ dir, checkMcp: false });
    assert.equal(findSkills(checks).status, 'skip');

    // a couple of small skills → ok, count surfaced
    for (const n of ['alpha', 'beta']) {
      mkdirSync(skillDir(n), { recursive: true });
      writeFileSync(join(skillDir(n), 'SKILL.md'), `---\nname: ${n}\n---\nbody`);
    }
    ({ checks } = await runDoctor({ dir, checkMcp: false }));
    assert.equal(findSkills(checks).status, 'ok');
    assert.match(findSkills(checks).detail, /2 installed/);

    // one oversized skill crosses the (150k) warn threshold
    mkdirSync(skillDir('huge'), { recursive: true });
    writeFileSync(join(skillDir('huge'), 'SKILL.md'), 'x'.repeat(640_000)); // ~160k tokens
    ({ checks } = await runDoctor({ dir, checkMcp: false }));
    assert.equal(findSkills(checks).status, 'warn');
    assert.match(findSkills(checks).detail, /trim/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('doctor: missing kiro-cli and missing agents are failures', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kf-m3-empty-'));
  const origPath = process.env.PATH;
  // strip any real kiro-cli from PATH influence by pointing PATH at an empty dir + node/npm dirs
  const binDir = join(dir, 'fake-bin');
  mkdirSync(binDir);
  process.env.PATH = `${binDir}:${dirname(process.execPath)}:/usr/bin:/bin`;
  try {
    const { checks, failed } = await runDoctor({ dir, checkMcp: false });
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
    assert.equal(byId['kiro-cli'].status, 'fail');
    assert.equal(byId['kiro-auth'].status, 'skip');
    assert.equal(byId['mcp-config'].status, 'fail');
    assert.equal(byId.agents.status, 'fail');
    assert.equal(failed, true);
  } finally {
    process.env.PATH = origPath;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('install.sh: bash syntax + dry run wiring', () => {
  const script = join(here, '..', '..', '..', 'scripts', 'install.sh');
  execFileSync('bash', ['-n', script]);
  const dir = mkdtempSync(join(tmpdir(), 'kf-install-'));
  try {
    const out = execFileSync('bash', [script, '--no-init', '--dry-run'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, KIRO_FLOW_LOCAL: join(here, '..', '..', '..'), KIRO_FLOW_DRY_RUN: '1' },
    });
    assert.match(out, /kiro-flow is ready/);
    assert.doesNotMatch(out, /Initializing project/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
