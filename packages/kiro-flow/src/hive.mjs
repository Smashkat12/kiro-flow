/**
 * kiro-flow hive-mind — the interactive swarm plane on Kiro.
 *
 * Upstream `ruflo hive-mind spawn --claude` writes a queen coordination
 * prompt to .hive-mind/sessions/ and launches the `claude` binary with it
 * (commands/hive-mind.ts:326 — interactive, prompt as argv). Kiro's
 * equivalent interactive host is `kiro-cli chat`, so we:
 *
 *   1. run the unmodified upstream spawn with --dry-run (hive state +
 *      prompt file are produced, nothing is launched),
 *   2. rewrite the prompt's Claude-Code-isms to Kiro's reality
 *      (mcp__ruflo__X → bare X, which is how Kiro presents MCP tools to the
 *      model; Task tool → subagent; native tool names),
 *   3. launch `kiro-cli chat --agent kf-queen` with the rewritten prompt.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runRuflo } from './daemon.mjs';

/** Rewrite a generated hive-mind prompt for a Kiro (kf-queen) session. */
export function kiroifyHivePrompt(text) {
  return String(text)
    // Kiro presents MCP tools to the model by their bare names (verified
    // empirically: an agent with @claude-flow/memory_store lists the tool
    // as `memory_store`), so every mcp__server__ prefix must go.
    .replace(/mcp__(?:ruflo|claude-flow)__/g, '')
    .replace(/Claude native Task\/Agent tools/g, "Kiro's native subagent tool")
    .replace(/\(Read, Write, Edit, Bash, Grep, Glob\)/g, '(read, write, shell)')
    .replace(/Claude Code/g, 'Kiro');
}

/** Newest generated prompt file in .hive-mind/sessions/, or null. */
export function findLatestHivePrompt(dir) {
  const sessions = join(dir, '.hive-mind', 'sessions');
  if (!existsSync(sessions)) return null;
  const candidates = readdirSync(sessions)
    .filter((f) => f.startsWith('hive-mind-prompt-') && f.endsWith('.txt') && !f.endsWith('-kiro.txt'))
    .map((f) => ({ f, mtime: statSync(join(sessions, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return candidates.length ? join(sessions, candidates[0].f) : null;
}

const hiveInitialized = (dir) => existsSync(join(dir, '.claude-flow', 'hive-mind', 'state.json'));

/**
 * `kiro-flow hive-mind spawn -o <objective> [...]`.
 * Everything except the launch step is delegated to unmodified ruflo.
 * Returns the exit code.
 */
export function hiveSpawnCommand({ dir, executor, rest, topology = 'hierarchical-mesh', noInteractive = false }) {
  if (!hiveInitialized(dir)) {
    const code = runRuflo({ dir, executor, args: ['hive-mind', 'init', '-t', topology] });
    if (code !== 0) return code;
  }

  // Upstream does the hive bookkeeping and writes the prompt file; --dry-run
  // stops it from launching the claude binary (we launch kiro-cli instead).
  const code = runRuflo({ dir, executor, args: ['hive-mind', 'spawn', '--claude', '--dry-run', ...rest] });
  if (code !== 0) return code;

  const promptFile = findLatestHivePrompt(dir);
  if (!promptFile) {
    console.error('kiro-flow: upstream spawn produced no .hive-mind/sessions/hive-mind-prompt-*.txt');
    return 1;
  }
  const kiroPrompt = kiroifyHivePrompt(readFileSync(promptFile, 'utf8'));
  const kiroFile = promptFile.replace(/\.txt$/, '-kiro.txt');
  writeFileSync(kiroFile, kiroPrompt);
  console.log(`\nkiro-flow: Kiro prompt written to ${kiroFile}`);

  if (!existsSync(join(dir, '.kiro', 'agents', 'kf-queen.json'))) {
    console.error('kiro-flow: .kiro/agents/kf-queen.json missing — run kiro-flow init first');
    return 1;
  }

  const args = ['chat', '--trust-all-tools', '--agent', 'kf-queen'];
  if (noInteractive) args.push('--no-interactive');
  args.push(kiroPrompt);
  console.log(`kiro-flow: launching kiro-cli chat --agent kf-queen${noInteractive ? ' --no-interactive' : ''}\n`);
  const res = spawnSync('kiro-cli', args, { cwd: dir, stdio: 'inherit' });
  if (res.error) {
    console.error(`kiro-flow: failed to launch kiro-cli: ${res.error.message}`);
    return 127;
  }
  return res.status ?? 1;
}
