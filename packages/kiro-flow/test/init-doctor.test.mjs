/** M3 tests: init idempotency + artifact correctness, doctor checks with mocked kiro-cli/MCP. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { initWorkspace, buildOrchestratorAgent, buildQueenAgent } from '../src/init.mjs';
import { runDoctor } from '../src/doctor.mjs';
import { DEFAULT_MODEL_MAP } from '../src/convert/tool-map.mjs';

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

test('init --exclude drops a category, persists exclude.json, and prunes prior emits', () => {
  const dir = makeFixtureWorkspace();
  try {
    // add a droppable category + a stale previously-emitted agent from it
    mkdirSync(join(dir, '.claude', 'agents', 'flow-nexus'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'agents', 'flow-nexus', 'sandbox.md'),
      '---\nname: sandbox\ndescription: cloud sandbox\n---\n\nCloud sandbox agent.\n');
    mkdirSync(join(dir, '.kiro', 'agents', 'prompts'), { recursive: true });
    writeFileSync(join(dir, '.kiro', 'agents', 'kf-sandbox.json'), '{"name":"kf-sandbox"}'); // stale prior emit
    writeFileSync(join(dir, '.kiro', 'agents', 'prompts', 'kf-sandbox.md'), 'stale');

    initWorkspace({ dir, skipRufloInit: true, excludeCategories: ['flow-nexus'] });

    // excluded agent is gone (pruned), a normal one survives
    assert.ok(!existsSync(join(dir, '.kiro', 'agents', 'kf-sandbox.json')), 'excluded agent pruned');
    assert.ok(!existsSync(join(dir, '.kiro', 'agents', 'prompts', 'kf-sandbox.md')), 'excluded prompt pruned');
    assert.ok(existsSync(join(dir, '.kiro', 'agents', 'kf-coder.json')), 'non-excluded agent kept');
    // exclusion persisted → a plain re-init keeps honoring it
    const ex = JSON.parse(readFileSync(join(dir, '.kiro', 'kiro-flow', 'exclude.json'), 'utf8'));
    assert.deepEqual(ex.categories, ['flow-nexus']);
    initWorkspace({ dir, skipRufloInit: true });
    assert.ok(!existsSync(join(dir, '.kiro', 'agents', 'kf-sandbox.json')), 'still excluded on plain re-init');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('init --plugins ports a plugin (agents+skills+commands), persists, replays, and reverts', () => {
  const dir = makeFixtureWorkspace();
  try {
    initWorkspace({ dir, skipRufloInit: true, includePlugins: ['ruflo-ddd'] });

    // agent converted, plugin skill installed, command namespaced + resolvable
    assert.ok(existsSync(join(dir, '.kiro', 'agents', 'kf-domain-modeler.json')), 'plugin agent emitted');
    assert.ok(existsSync(join(dir, '.kiro', 'skills', 'ddd-context', 'SKILL.md')), 'plugin skill installed');
    assert.ok(existsSync(join(dir, '.claude', 'commands', 'ddd', 'ddd.md')), 'plugin command installed');
    const enabled = JSON.parse(readFileSync(join(dir, '.kiro', 'kiro-flow', 'plugins.json'), 'utf8')).enabled;
    assert.deepEqual(enabled, ['ruflo-ddd']);
    // flagship deep-researcher survives (ruflo-goals owns that name, but it's not enabled here)
    assert.ok(existsSync(join(dir, '.kiro', 'agents', 'kf-deep-researcher.json')), 'flagship intact');

    // plain re-init replays the persisted enable → plugin agent stays
    initWorkspace({ dir, skipRufloInit: true });
    assert.ok(existsSync(join(dir, '.kiro', 'agents', 'kf-domain-modeler.json')), 'plugin persisted across re-init');

    // disabling reconciles everything away
    writeFileSync(join(dir, '.kiro', 'kiro-flow', 'plugins.json'), '{"enabled":[]}\n');
    initWorkspace({ dir, skipRufloInit: true });
    assert.ok(!existsSync(join(dir, '.kiro', 'agents', 'kf-domain-modeler.json')), 'plugin agent pruned');
    assert.ok(!existsSync(join(dir, '.kiro', 'skills', 'ddd-context')), 'plugin skill removed');
    assert.ok(!existsSync(join(dir, '.claude', 'commands', 'ddd')), 'plugin command removed');
    assert.ok(existsSync(join(dir, '.kiro', 'agents', 'kf-deep-researcher.json')), 'flagship still intact');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('flagship agents (orchestrator/queen) route to the opus tier', () => {
  assert.equal(DEFAULT_MODEL_MAP.opus, 'claude-opus-4.8');
  assert.equal(buildOrchestratorAgent(['kf-coder']).model, DEFAULT_MODEL_MAP.opus);
  assert.equal(buildQueenAgent(['kf-coder']).model, DEFAULT_MODEL_MAP.opus);
  // a custom map re-routes the flagship model too
  assert.equal(buildOrchestratorAgent(['kf-coder'], 'claude-opus-4.6').model, 'claude-opus-4.6');
});

test('flagships carry a welcomeMessage + keyboardShortcut; headless agents must not', () => {
  const orch = buildOrchestratorAgent(['kf-coder']);
  const queen = buildQueenAgent(['kf-coder']);
  for (const a of [orch, queen]) {
    assert.ok(a.welcomeMessage && a.welcomeMessage.includes(a.name), `${a.name}: welcomeMessage should name the agent`);
    assert.match(a.keyboardShortcut, /^ctrl\+alt\+[a-z]$/);
  }
  assert.notEqual(orch.keyboardShortcut, queen.keyboardShortcut, 'shortcuts must be distinct');
  // headless-safety: a welcome would corrupt the shim's parsed output, so the
  // global tool-free judge must NOT have one.
  const judge = JSON.parse(readFileSync(join(here, '..', 'templates', 'agents', 'kf-judge.json'), 'utf8'));
  assert.ok(!('welcomeMessage' in judge), 'kf-judge (headless) must have no welcomeMessage');
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
  writeFileSync(kiroCliPath, '#!/bin/sh\ncase "$1" in --version) echo "kiro-cli 1.2.3";; whoami) echo "smash@work (sso)";; chat) echo "ok";; *) exit 1;; esac\n');
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
    // headless probe ran the real `chat --no-interactive` path against the stub
    assert.equal(byId['kiro-headless'].status, 'ok', byId['kiro-headless'].detail);
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

test('doctor: headless probe warns when interactive auth works but `chat` fails, skips under --no-headless', async () => {
  const dir = makeFixtureWorkspace();
  const binDir = join(dir, 'fake-bin');
  mkdirSync(binDir);
  const kiroCliPath = join(binDir, 'kiro-cli');
  // logged-in interactively (whoami ok) but headless turns fail — the exact
  // work-laptop SSO gap the probe exists to surface.
  writeFileSync(kiroCliPath, '#!/bin/sh\ncase "$1" in --version) echo "kiro-cli 1.2.3";; whoami) echo "smash@work (sso)";; chat) echo "sso: headless auth required" >&2; exit 1;; *) exit 1;; esac\n');
  chmodSync(kiroCliPath, 0o755);
  const origPath = process.env.PATH;
  process.env.PATH = `${binDir}:${origPath}`;
  try {
    let { checks } = await runDoctor({ dir, checkMcp: false });
    let byId = Object.fromEntries(checks.map((c) => [c.id, c]));
    assert.equal(byId['kiro-auth'].status, 'ok');
    assert.equal(byId['kiro-headless'].status, 'warn');
    assert.match(byId['kiro-headless'].detail, /KIRO_API_KEY|headless/);

    // --no-headless skips the probe (no credit spent)
    ({ checks } = await runDoctor({ dir, checkMcp: false, checkHeadless: false }));
    byId = Object.fromEntries(checks.map((c) => [c.id, c]));
    assert.equal(byId['kiro-headless'].status, 'skip');
    assert.match(byId['kiro-headless'].detail, /disabled/);
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
    assert.equal(byId['kiro-headless'].status, 'skip');
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
