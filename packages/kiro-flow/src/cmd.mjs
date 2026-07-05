/**
 * kiro-flow cmd — run ruflo's Claude Code slash-commands on Kiro.
 *
 * `ruflo init` installs ~166 command prompt files under .claude/commands/
 * (category dirs: swarm/, sparc/, github/, memory/, hooks/, …). On Claude
 * Code these are /slash-commands; Kiro has no equivalent surface, so:
 *
 *   kiro-flow cmd <name> [args…]   resolve .claude/commands/**\/<name>.md,
 *                                  substitute $ARGUMENTS, kiroify the text
 *                                  (same rewrites as the hive prompt), and
 *                                  launch kiro-cli chat with it
 *   kiro-flow cmd --list           catalogue (curated top picks first)
 *
 * Curation: CURATED lists the commands worth reaching for on Kiro — the rest
 * still run, they're just not surfaced first. Dossier 09 catalogues all.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { kiroifyHivePrompt } from './hive.mjs';

/** The top picks — verified present in the published bundle, useful on Kiro. */
export const CURATED = [
  ['swarm/research', 'multi-agent research sweep on a topic'],
  ['swarm/development', 'coordinated feature build'],
  ['swarm/analysis', 'codebase analysis swarm'],
  ['swarm/testing', 'test-focused swarm'],
  ['swarm/optimization', 'performance-focused swarm'],
  ['sparc/architect', 'SPARC architecture phase'],
  ['sparc/code', 'SPARC implementation phase'],
  ['sparc/tdd', 'SPARC test-driven development'],
  ['sparc/security-review', 'SPARC security review'],
  ['sparc/refinement-optimization-mode', 'SPARC refinement pass'],
  ['github/pr-manager', 'pull-request management workflow'],
  ['github/code-review', 'structured code review'],
  ['github/issue-tracker', 'issue triage/tracking'],
  ['github/release-manager', 'release workflow'],
  ['memory/memory-usage', 'memory store/retrieve patterns'],
  ['memory/neural', 'neural memory patterns'],
  ['analysis/performance-bottlenecks', 'find performance bottlenecks'],
  ['automation/smart-agents', 'auto-select agents for a task'],
  ['coordination/swarm-init', 'initialize swarm coordination'],
  ['monitoring/swarm-monitor', 'monitor a running swarm'],
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith('.md')) out.push(p);
  }
  return out;
}

/** All installed commands as {id: 'category/name', path}. */
export function listCommands(dir) {
  const root = join(dir, '.claude', 'commands');
  if (!existsSync(root)) return [];
  return walk(root).map((p) => ({
    id: relative(root, p).replace(/\.md$/, '').split(sep).join('/'),
    path: p,
  })).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Resolve a command by full id ('swarm/research') or bare name ('research').
 * Bare names must be unambiguous; returns {path} or {error, candidates?}.
 */
export function resolveCommand(dir, name) {
  const all = listCommands(dir);
  if (!all.length) return { error: 'no .claude/commands directory — run kiro-flow init first' };
  const clean = name.replace(/\.md$/, '');
  const exact = all.find((c) => c.id === clean);
  if (exact) return exact;
  const byName = all.filter((c) => basename(c.id) === clean);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    return { error: `ambiguous command '${name}'`, candidates: byName.map((c) => c.id) };
  }
  return { error: `unknown command '${name}'`, candidates: all.filter((c) => c.id.includes(clean)).slice(0, 5).map((c) => c.id) };
}

/** Command text → Kiro prompt: strip frontmatter, substitute args, kiroify. */
export function buildCmdPrompt(raw, args) {
  let body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
  const argStr = args.join(' ');
  if (/\$ARGUMENTS/.test(body)) body = body.replaceAll('$ARGUMENTS', argStr);
  else if (argStr) body = `${body.trimEnd()}\n\n## Arguments\n\n${argStr}\n`;
  return kiroifyHivePrompt(body);
}

export function cmdCommand({ dir, name, args, agent = 'kf-orchestrator', noInteractive = false, dryRun = false }) {
  if (name === '--list' || name === 'list') {
    const all = listCommands(dir);
    const ids = new Set(all.map((c) => c.id));
    console.log('Curated (kiro-flow cmd <id>):');
    for (const [id, note] of CURATED) {
      console.log(`  ${ids.has(id) ? '●' : '○'} ${id.padEnd(38)} ${note}`);
    }
    console.log(`\nAll installed: ${all.length} commands (● = present in this workspace)`);
    console.log('Full list: kiro-flow cmd --list-all   catalogue: dossiers/09');
    return 0;
  }
  if (name === '--list-all') {
    for (const c of listCommands(dir)) console.log(c.id);
    return 0;
  }
  const resolved = resolveCommand(dir, name);
  if (resolved.error) {
    console.error(`kiro-flow: ${resolved.error}`);
    if (resolved.candidates?.length) console.error(`  did you mean: ${resolved.candidates.join(', ')}`);
    return 1;
  }
  const prompt = buildCmdPrompt(readFileSync(resolved.path, 'utf8'), args);
  if (dryRun) {
    process.stdout.write(prompt);
    return 0;
  }
  const kiroArgs = ['chat', '--trust-all-tools', '--agent', agent];
  if (noInteractive) kiroArgs.push('--no-interactive');
  kiroArgs.push(prompt);
  const res = spawnSync('kiro-cli', kiroArgs, { cwd: dir, stdio: 'inherit' });
  if (res.error) {
    console.error(`kiro-flow: failed to launch kiro-cli: ${res.error.message}`);
    return 127;
  }
  return res.status ?? 1;
}
