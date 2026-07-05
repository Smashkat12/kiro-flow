/**
 * kiro-flow skills — port ruflo's skill playbooks onto Kiro's skills surface.
 *
 * Kiro auto-loads every `.kiro/skills/*` /SKILL.md (and `~/.kiro/skills`) into
 * ALL agents' context (verified on kiro-cli 2.10.0 via `/context show`) — no
 * per-agent `skill://` wiring needed, the file's presence is enough. Because
 * they auto-load globally, skills are OPT-IN, not part of `kiro-flow init`:
 * ruflo ships ~39 skills totalling ~150k tokens, so dumping all of them would
 * swamp every agent's window. Install a curated few (`--core`) or name the ones
 * you want; `list` shows the per-skill context cost.
 */
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync,
} from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';

/** Where ruflo init writes skills, and where Kiro reads them, relative to the workspace. */
export const SKILL_SOURCE_REL = join('.claude', 'skills');
export const SKILL_DEST_REL = join('.kiro', 'skills');

/**
 * Curated, broadly-useful methodology skills — safe default for `--core`.
 * Deliberately small (general dev methodology, no plugin/flow-nexus/v3-internal
 * specifics) to keep the always-on context cost modest (~4-5k tokens each).
 */
export const SKILL_CORE = [
  'sparc-methodology',
  'swarm-orchestration',
  'hooks-automation',
  'verification-quality',
];

/** Rough token estimate for a file or directory tree (chars / 4). */
function estimateTokens(path) {
  let bytes = 0;
  const visit = (p) => {
    const st = statSync(p);
    if (st.isDirectory()) for (const e of readdirSync(p)) visit(join(p, e));
    else bytes += st.size;
  };
  if (existsSync(path)) visit(path);
  return Math.round(bytes / 4);
}

/**
 * Discover installable skills under a source dir (default `<dir>/.claude/skills`).
 * A skill is any subdirectory containing a SKILL.md.
 * @returns {Array<{name, path, description, tokens}>}
 */
export function discoverSkills(sourceDir) {
  if (!existsSync(sourceDir)) return [];
  const out = [];
  for (const name of readdirSync(sourceDir).sort()) {
    const dir = join(sourceDir, name);
    const skillMd = join(dir, 'SKILL.md');
    if (!statSync(dir).isDirectory() || !existsSync(skillMd)) continue;
    const { attrs } = parseFrontmatter(readFileSync(skillMd, 'utf8'));
    out.push({
      name,
      path: dir,
      description: (attrs.description ?? '').replace(/\s+/g, ' ').trim(),
      tokens: estimateTokens(dir),
    });
  }
  return out;
}

/** Names currently installed under `<dir>/.kiro/skills`. */
export function installedSkills(dir) {
  const dest = join(dir, SKILL_DEST_REL);
  if (!existsSync(dest)) return [];
  return readdirSync(dest)
    .filter((n) => existsSync(join(dest, n, 'SKILL.md')))
    .sort();
}

/**
 * The always-on cost of installed skills: they auto-load into every agent, so
 * this is roughly how much of each agent's window is spent before any work.
 * @returns {{count:number, tokens:number, names:string[]}}
 */
export function installedSkillsCost(dir) {
  const skills = discoverSkills(join(dir, SKILL_DEST_REL));
  return {
    count: skills.length,
    tokens: skills.reduce((n, s) => n + s.tokens, 0),
    names: skills.map((s) => s.name),
  };
}

/**
 * Resolve which skill names to act on from a selection.
 * @param {{core?:boolean, all?:boolean, names?:string[]}} sel
 * @param {Array<{name}>} available
 */
export function resolveSelection(sel, available) {
  const have = new Set(available.map((s) => s.name));
  if (sel.all) return available.map((s) => s.name);
  if (sel.core) return SKILL_CORE.filter((n) => have.has(n));
  return (sel.names ?? []).filter(Boolean);
}

/**
 * Copy selected skill dirs from source into `<dir>/.kiro/skills`.
 * @returns {{installed:string[], missing:string[], tokens:number}}
 */
export function installSkills({ dir, source, names }) {
  const sourceDir = source ?? join(dir, SKILL_SOURCE_REL);
  const dest = join(dir, SKILL_DEST_REL);
  const installed = [];
  const missing = [];
  let tokens = 0;
  for (const name of names) {
    const src = join(sourceDir, name);
    if (!existsSync(join(src, 'SKILL.md'))) { missing.push(name); continue; }
    mkdirSync(dest, { recursive: true });
    cpSync(src, join(dest, name), { recursive: true });
    tokens += estimateTokens(join(dest, name));
    installed.push(name);
  }
  return { installed: installed.sort(), missing, tokens };
}

/** Remove skill dirs from `<dir>/.kiro/skills`. @returns removed names. */
export function removeSkills({ dir, names }) {
  const dest = join(dir, SKILL_DEST_REL);
  const removed = [];
  for (const name of names) {
    const p = join(dest, name);
    if (existsSync(p)) { rmSync(p, { recursive: true, force: true }); removed.push(name); }
  }
  return removed.sort();
}

const fmtK = (t) => `${(t / 1000).toFixed(1)}k tok`;

/**
 * CLI: `kiro-flow skills <list|add|remove> …`. Returns an exit code.
 * @param {{dir:string, sub?:string, source?:string, core?:boolean, all?:boolean, names?:string[]}} opts
 */
export function skillsCommand({ dir, sub, source, core = false, all = false, names = [] }) {
  const sourceDir = source ?? join(dir, SKILL_SOURCE_REL);
  const available = discoverSkills(sourceDir);
  const have = new Set(installedSkills(dir));

  if (!sub || sub === 'list') {
    if (!available.length) {
      console.error(`no skills found under ${sourceDir} — run kiro-flow init (ruflo ships them under .claude/skills)`);
      return available.length ? 0 : 1;
    }
    const instTokens = available.filter((s) => have.has(s.name)).reduce((n, s) => n + s.tokens, 0);
    console.log(`skills under ${sourceDir} (▪ installed → auto-loaded into every agent):\n`);
    for (const s of available) {
      const mark = have.has(s.name) ? '▪' : '·';
      console.log(`  ${mark} ${s.name.padEnd(32)} ${fmtK(s.tokens).padStart(9)}  ${s.description.slice(0, 60)}`);
    }
    console.log(`\n${have.size} installed (~${fmtK(instTokens)} always-on) of ${available.length} available (~${fmtK(available.reduce((n, s) => n + s.tokens, 0))} total).`);
    console.log('add:  kiro-flow skills add --core | <name…> | --all      remove: kiro-flow skills remove <name…> | --all');
    return 0;
  }

  if (sub === 'add') {
    const sel = resolveSelection({ core, all, names }, available);
    if (!sel.length) { console.error('nothing selected — pass --core, --all, or skill names (kiro-flow skills list)'); return 1; }
    const { installed, missing, tokens } = installSkills({ dir, source: sourceDir, names: sel });
    if (installed.length) {
      console.log(`installed ${installed.length} skill(s) → ${join(dir, SKILL_DEST_REL)} (~${fmtK(tokens)} added to every agent's context):`);
      for (const n of installed) console.log(`  ▪ ${n}`);
    }
    if (missing.length) console.error(`not found in ${sourceDir}: ${missing.join(', ')}`);
    if (all || sel.length > 6) console.log('\nnote: skills auto-load into ALL agents — trim with `kiro-flow skills remove` if context gets tight.');
    return missing.length && !installed.length ? 1 : 0;
  }

  if (sub === 'remove') {
    const sel = all ? [...have] : names;
    if (!sel.length) { console.error('nothing selected — pass --all or skill names'); return 1; }
    const removed = removeSkills({ dir, names: sel });
    console.log(removed.length ? `removed ${removed.length} skill(s): ${removed.join(', ')}` : 'nothing removed — none of those are installed');
    return 0;
  }

  console.error('usage: kiro-flow skills <list|add|remove> [--core|--all|<name…>] [--dir <dir>] [--source <dir>]');
  return 1;
}
