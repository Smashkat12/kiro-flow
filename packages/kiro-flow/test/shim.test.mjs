/**
 * M5 tests: kiro-claude-shim contract. Golden invocation shapes are the two
 * spawn sites in published ruflo 3.23 (headless-worker-executor.ts:1202 and
 * fable-harness.ts buildArgv) — replayed here against the shim's translator
 * and, in mock mode, against the real shim process.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executorEnv, resolveShimDir, syncBinShim } from '../src/daemon.mjs';
import { lstatSync, readlinkSync, existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const SHIM = join(here, '..', 'shim', 'claude');
const require = createRequire(import.meta.url);
const {
  parseClaudeArgv, buildKiroArgv, cleanKiroOutput, parseCredits, buildEnvelope, mapModel,
} = require(SHIM);

// ── golden shape 1: worker executor — spawn('claude', ['--print']) ─────────

test('golden(worker): --print with ANTHROPIC_MODEL env → kiro chat argv', () => {
  const parsed = parseClaudeArgv(['--print']);
  assert.equal(parsed.print, true);
  const argv = buildKiroArgv(parsed, 'analyze the codebase', {
    ANTHROPIC_MODEL: 'haiku', // MODEL_IDS alias, exactly as the executor sets it
  });
  assert.deepEqual(argv, [
    'chat', '--no-interactive', '--trust-all-tools',
    '--model', 'claude-haiku-4.5',
    'analyze the codebase',
  ]);
});

// ── golden shape 2: fable harness buildArgv ─────────────────────────────────

test('golden(fable): -p --model --output-format json --append-system-prompt --max-budget-usd', () => {
  const parsed = parseClaudeArgv([
    '-p',
    '--model', 'claude-fable-5',
    '--output-format', 'json',
    '--append-system-prompt', 'You are a strict evaluator.',
    '--max-budget-usd', '2.5',
  ]);
  assert.equal(parsed.print, true);
  assert.equal(parsed.outputFormat, 'json');
  assert.equal(parsed.systemPrompt, 'You are a strict evaluator.');
  assert.deepEqual(parsed.ignored, ['--max-budget-usd 2.5']);

  // claude-fable-5 has no Kiro equivalent → omit --model, Kiro's `auto` decides
  const argv = buildKiroArgv(parsed, 'PROMPT', {});
  assert.deepEqual(argv, ['chat', '--no-interactive', '--trust-all-tools', 'PROMPT']);
});

test('model mapping: aliases map, opus degrades to best claude, unknown → null', () => {
  assert.equal(mapModel('haiku'), 'claude-haiku-4.5');
  assert.equal(mapModel('sonnet'), 'claude-sonnet-4.5');
  assert.equal(mapModel('opus'), 'claude-sonnet-4.5');
  assert.equal(mapModel('gpt-5'), null);
  assert.equal(mapModel(undefined), null);
});

test('judge routing: CLAUDE_ENTRYPOINT=fable-judge → global kf-judge at low effort', () => {
  const parsed = parseClaudeArgv(['-p', '--model', 'claude-fable-5', '--output-format', 'json']);
  const argv = buildKiroArgv(parsed, 'P', { CLAUDE_ENTRYPOINT: 'fable-judge' });
  assert.deepEqual(argv, [
    'chat', '--no-interactive', '--trust-all-tools',
    '--agent', 'kf-judge', '--effort', 'low', 'P',
  ]);

  // opt-out and override
  assert.ok(!buildKiroArgv(parsed, 'P', { CLAUDE_ENTRYPOINT: 'fable-judge', KIRO_FLOW_JUDGE_AGENT: '' }).includes('--agent'));
  assert.ok(buildKiroArgv(parsed, 'P', { CLAUDE_ENTRYPOINT: 'fable-judge', KIRO_FLOW_JUDGE_AGENT: 'kf-custom' }).includes('kf-custom'));

  // worker calls stay untouched
  const worker = buildKiroArgv(parseClaudeArgv(['--print']), 'P', { CLAUDE_ENTRYPOINT: 'worker' });
  assert.ok(!worker.includes('--agent'));
  assert.ok(!worker.includes('--effort'));
});

test('env knobs: trust-tools, agent, effort reshape the kiro argv', () => {
  const argv = buildKiroArgv(parseClaudeArgv(['--print']), 'P', {
    KIRO_FLOW_SHIM_TRUST_TOOLS: 'fs_read,fs_write',
    KIRO_FLOW_SHIM_AGENT: 'kf-worker-specialist',
    KIRO_FLOW_SHIM_EFFORT: 'low',
  });
  assert.deepEqual(argv, [
    'chat', '--no-interactive', '--trust-tools=fs_read,fs_write',
    '--agent', 'kf-worker-specialist', '--effort', 'low', 'P',
  ]);
});

// ── output cleaning (fixture is a verbatim kiro-cli 2.10.0 capture shape) ──

test('cleanKiroOutput strips ANSI, spinners, response marker, credits footer', () => {
  const raw = '\x1b[38;5;12m⢀⠀ 0 of 1 hooks finished\x1b[1G\x1b[2K\x1b[?25l✓ 1 of 1 hooks finished in 0.08 s\n'
    + '\x1b[38;5;141m> \x1b[0mSHIM-LIVE-OK\nsecond line\n\n'
    + '\x1b[38;5;8m ▸ Credits: 0.09 • Time: 8s\n\x1b[0m';
  assert.equal(cleanKiroOutput(raw), 'SHIM-LIVE-OK\nsecond line');
  assert.equal(parseCredits(raw), 0.09);
});

test('buildEnvelope: success/error subtypes and optional cost mapping', () => {
  const ok = buildEnvelope({ text: 'hi', exitCode: 0, credits: 0.5 });
  assert.equal(ok.subtype, 'success');
  assert.equal(ok.is_error, false);
  assert.equal(ok.kiro_credits, 0.5);
  assert.ok(!('total_cost_usd' in ok), 'no cost without KIRO_FLOW_CREDIT_USD');

  const err = buildEnvelope({ text: '', exitCode: 3 });
  assert.equal(err.subtype, 'error_during_execution');
  assert.equal(err.is_error, true);
});

// ── shim as a process (mock executor: no kiro-cli, no LLM) ──────────────────

function runShim(args, { input = '', env = {} } = {}) {
  return spawnSync(process.execPath, [SHIM, ...args], {
    input, encoding: 'utf8',
    env: { ...process.env, KIRO_FLOW_EXECUTOR: 'mock', ...env },
  });
}

test('shim process: --version answers the availability probe with exit 0', () => {
  const res = runShim(['--version']);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /kiro-claude-shim/);
});

test('shim process: worker shape (stdin prompt, text out)', () => {
  const res = runShim(['--print'], { input: 'do the thing' });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /^MOCK-EXECUTOR ok/);
});

test('shim process: fable shape emits a parseable result envelope', () => {
  const res = runShim(
    ['-p', '--model', 'claude-fable-5', '--output-format', 'json', '--append-system-prompt', 'SYS', '--max-budget-usd', '1'],
    { input: '[{"id":"1"}]' },
  );
  assert.equal(res.status, 0);
  const env = JSON.parse(res.stdout);
  assert.equal(env.type, 'result');
  assert.equal(env.is_error, false);
  assert.match(env.result, /MOCK-EXECUTOR ok/);
});

test('shim process: stream-json emits one JSON object per line, result last', () => {
  const res = runShim(['-p', '--output-format', 'stream-json'], { input: 'x' });
  const lines = res.stdout.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines[0].type, 'system');
  assert.equal(lines.at(-1).type, 'result');
});

test('shim process: empty prompt is a hard error (exit 1), not a hung chat', () => {
  const res = runShim(['--print'], { input: '' });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /empty prompt/);
});

// ── executor env plumbing ────────────────────────────────────────────────────

test('executorEnv: kiro/mock prepend the shim dir to PATH, claude leaves it alone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kf-m5-'));
  try {
    const kiro = executorEnv('kiro', dir);
    assert.ok(kiro.PATH.startsWith(resolveShimDir(dir) + delimiter));
    assert.equal(kiro.KIRO_FLOW_EXECUTOR, undefined);

    const mock = executorEnv('mock', dir);
    assert.equal(mock.KIRO_FLOW_EXECUTOR, 'mock');

    assert.deepEqual(executorEnv('claude', dir), {});
    assert.throws(() => executorEnv('nope', dir), /unknown executor/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resolveShimDir prefers a workspace copy over the package copy', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kf-m5-ws-'));
  try {
    assert.equal(resolveShimDir(dir), join(here, '..', 'shim'));
    const ws = join(dir, '.kiro', 'kiro-flow', 'shim');
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, 'claude'), '#!/bin/sh\n');
    chmodSync(join(ws, 'claude'), 0o755);
    assert.equal(resolveShimDir(dir), ws);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('syncBinShim: plants the workspace .bin symlink for kiro/mock, removes it for claude', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kf-m5-bin-'));
  try {
    syncBinShim(dir, 'kiro');
    const link = join(dir, 'node_modules', '.bin', 'claude');
    assert.ok(lstatSync(link).isSymbolicLink());
    assert.match(readlinkSync(link), /shim\/claude$/);

    syncBinShim(dir, 'kiro'); // idempotent
    assert.ok(lstatSync(link).isSymbolicLink());

    syncBinShim(dir, 'claude'); // native executor must not be shadowed by us
    assert.equal(existsSync(link), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── work-laptop simulation: NO Claude Code anywhere on PATH ─────────────────

test('work-laptop: bare `claude --print` resolves to the shim on a PATH with no Claude Code', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kf-m5-worklaptop-'));
  try {
    // A minimal PATH: node's own dir + system dirs. No .npm-global, no
    // ~/.claude/local, no ancestor node_modules/.bin — the work-laptop shape.
    const barePath = [dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter);
    const env = {
      ...process.env,
      PATH: `${resolveShimDir(dir)}${delimiter}${barePath}`,
      KIRO_FLOW_EXECUTOR: 'mock',
    };
    const version = spawnSync('claude', ['--version'], { encoding: 'utf8', env, cwd: dir });
    assert.equal(version.status, 0);
    assert.match(version.stdout, /kiro-claude-shim/, 'availability probe must hit the shim');

    const res = spawnSync('claude', ['--print'], { input: 'worker sweep', encoding: 'utf8', env, cwd: dir });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /MOCK-EXECUTOR ok/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── the actual PATH-lookup contract ruflo relies on ─────────────────────────

test('e2e(mock): a child spawning bare `claude --print` under executorEnv hits the shim', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kf-m5-e2e-'));
  try {
    const env = { ...process.env, ...executorEnv('mock', dir) };
    // Recreate ruflo's exact spawn: binary name `claude`, argv ['--print'], prompt on stdin
    const res = spawnSync('claude', ['--print'], { input: 'worker sweep', encoding: 'utf8', env, cwd: dir });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /MOCK-EXECUTOR ok/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
