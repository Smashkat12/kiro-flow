/**
 * kiro-flow daemon/worker — run ruflo's unmodified worker plane with the
 * kiro-claude-shim on PATH, so every headless `claude` spawn the daemon makes
 * resolves to kiro-cli instead of Claude Code.
 *
 *   kiro-flow daemon start            → npx ruflo daemon start --headless   (shim PATH)
 *   kiro-flow daemon stop|status|...  → passthrough                         (shim PATH)
 *   kiro-flow worker dispatch -t X    → npx ruflo hooks worker dispatch -t X (shim PATH)
 *
 * Executors (--executor, default kiro):
 *   kiro    shim dir prepended to PATH → workers run through kiro-cli
 *   claude  PATH untouched → native Claude Code binary (home/Max-plan parity)
 *   mock    shim on PATH in mock mode → deterministic output, no LLM, for CI
 */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUFLO_SPEC } from './init.mjs';

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** Prefer the workspace copy (inspectable, versioned with the site), else the package's. */
export function resolveShimDir(dir) {
  const workspace = join(dir, '.kiro', 'kiro-flow', 'shim');
  if (existsSync(join(workspace, 'claude'))) return workspace;
  return join(pkgRoot, 'shim');
}

/** Env overrides that select the executor for any ruflo child process tree. */
export function executorEnv(executor, dir) {
  const shimDir = resolveShimDir(dir);
  switch (executor) {
    case 'kiro':
      return { PATH: `${shimDir}${delimiter}${process.env.PATH ?? ''}` };
    case 'mock':
      return { PATH: `${shimDir}${delimiter}${process.env.PATH ?? ''}`, KIRO_FLOW_EXECUTOR: 'mock' };
    case 'claude':
      return {};
    default:
      throw new Error(`unknown executor: ${executor} (want kiro|claude|mock)`);
  }
}

/**
 * npx prepends every node_modules/.bin from cwd upward to the child's PATH —
 * AHEAD of anything we prepend ourselves. Any stray `claude` in an ancestor
 * node_modules (observed: a forgotten claude-code install in $HOME) silently
 * beats the shim. The workspace's own node_modules/.bin is first in that
 * chain, so we pin the resolution by planting a symlink there.
 */
export function syncBinShim(dir, executor) {
  const binDir = join(dir, 'node_modules', '.bin');
  const link = join(binDir, 'claude');
  const target = join(resolveShimDir(dir), 'claude');
  const oursAt = () => {
    try {
      if (!lstatSync(link).isSymbolicLink()) return false;
      const t = readlinkSync(link);
      return t === target || t.includes(join('.kiro', 'kiro-flow', 'shim')) || t.includes(join('kiro-flow', 'shim'));
    } catch { return false; }
  };
  if (executor === 'claude') {
    // native executor: make sure OUR symlink doesn't shadow the real binary
    if (existsSync(link) && oursAt()) rmSync(link);
    return;
  }
  if (existsSync(link)) {
    if (oursAt()) return;
    // a real claude bin is installed in this workspace — leave it alone and
    // rely on PATH prepending; warn so the operator understands the risk
    console.error(`kiro-flow: warning: ${link} exists and is not the shim — headless workers may resolve it first`);
    return;
  }
  mkdirSync(binDir, { recursive: true });
  symlinkSync(target, link);
}

/**
 * Run a ruflo CLI invocation with the executor env in place, stdio inherited.
 * Returns the child's exit code.
 */
export function runRuflo({ dir, executor, args }) {
  syncBinShim(dir, executor);
  const env = { ...process.env, ...executorEnv(executor, dir), CLAUDE_FLOW_SETUP_MCP: '0' };
  const res = spawnSync('npx', ['-y', RUFLO_SPEC, ...args], {
    cwd: dir,
    env,
    stdio: 'inherit',
  });
  if (res.error) {
    console.error(`kiro-flow: failed to run npx ${RUFLO_SPEC}: ${res.error.message}`);
    return 127;
  }
  return res.status ?? 1;
}

/**
 * `kiro-flow daemon <sub> [args...]`. For `start` we add --headless when the
 * caller didn't — the whole point of the wrapper is the headless worker plane.
 */
export function daemonCommand({ dir, executor, sub, rest }) {
  const args = ['daemon', sub, ...rest];
  if (sub === 'start' && !rest.includes('--headless')) args.push('--headless');
  return runRuflo({ dir, executor, args });
}

/** `kiro-flow worker <args...>` → `ruflo hooks worker <args...>`. */
export function workerCommand({ dir, executor, rest }) {
  return runRuflo({ dir, executor, args: ['hooks', 'worker', ...rest] });
}
