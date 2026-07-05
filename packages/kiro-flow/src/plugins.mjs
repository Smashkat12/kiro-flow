/**
 * kiro-flow plugins — port ruflo's "port-tier" marketplace plugins onto Kiro.
 *
 * ruflo ships ~35 marketplace plugins. About half are pure tool packs already
 * served by the 350-tool claude-flow MCP (dossiers/11-plugin-audit.md); a
 * handful are external verticals we don't ship. The **port tier** is the set
 * that carries no dedicated engine — they are agents + slash-commands + skill
 * playbooks. Those are the ones this module makes runnable on Kiro.
 *
 * `ruflo init` does NOT install the plugins tree (plugins come from an IPFS
 * registry via `ruflo plugins install`, unreliable-to-blocked on a governed
 * work laptop). So we VENDOR the port-tier plugin sources into the package
 * (`packages/kiro-flow/plugins/<name>/`); they ship with the git-clone install
 * and need no network fetch at work.
 *
 * Enabling is reproducible, mirroring `exclude.json`: the enabled set is
 * persisted to `.kiro/kiro-flow/plugins.json` and REPLAYED by `kiro-flow init`
 * — plugin agents flow through the SAME conversion pass (as extraSources), and
 * their skills/commands are reconciled on every re-init.
 */
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from './convert/frontmatter.mjs';
import { sanitizeName } from './convert/agents.mjs';
import { installSkills, removeSkills } from './convert/skills.mjs';

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const PLUGINS_ROOT = join(pkgRoot, 'plugins');
export const PLUGINS_REL = join('.kiro', 'kiro-flow', 'plugins.json');
/** Where a plugin's slash-commands land so `kiro-flow cmd` can resolve them. */
export const PLUGIN_CMD_REL = join('.claude', 'commands');

/**
 * Force each plugin's agents onto the closest existing tool profile
 * (CATEGORY_PROFILE in tool-map.mjs). Unmapped → the short name → `worker`.
 */
const PLUGIN_CATEGORY = {
  'ruflo-goals': 'goal',
  'ruflo-docs': 'documentation',
  'ruflo-adr': 'architecture',
  'ruflo-ddd': 'architecture',
  'ruflo-knowledge-graph': 'data',
  'ruflo-security-audit': 'analysis',
  'ruflo-migrations': 'architecture',
  'ruflo-plugin-creator': 'worker',
};

const shortName = (name) => name.replace(/^ruflo-/, '');

function listDirs(p) {
  if (!existsSync(p)) return [];
  return readdirSync(p).filter((e) => statSync(join(p, e)).isDirectory()).sort();
}
function listMd(p) {
  if (!existsSync(p)) return [];
  return readdirSync(p).filter((e) => e.endsWith('.md')).sort();
}

/** kf-<name> for each agent .md a plugin ships (from its frontmatter name). */
export function pluginAgentNames(pluginDir) {
  const adir = join(pluginDir, 'agents');
  const names = [];
  for (const f of listMd(adir)) {
    const { attrs, hasFrontmatter } = parseFrontmatter(readFileSync(join(adir, f), 'utf8'));
    if (hasFrontmatter && attrs.name) names.push(`kf-${sanitizeName(attrs.name)}`);
  }
  return names;
}

/** Everything vendored, with counts + description. */
export function discoverPlugins(root = PLUGINS_ROOT) {
  if (!existsSync(root)) return [];
  return listDirs(root).map((name) => {
    const dir = join(root, name);
    let description = '';
    const manifest = join(dir, '.claude-plugin', 'plugin.json');
    if (existsSync(manifest)) {
      try { description = JSON.parse(readFileSync(manifest, 'utf8')).description ?? ''; } catch { /* ignore */ }
    }
    return {
      name,
      short: shortName(name),
      description,
      dir,
      category: PLUGIN_CATEGORY[name] ?? shortName(name),
      agents: listMd(join(dir, 'agents')),
      agentKfNames: pluginAgentNames(dir),
      commands: listMd(join(dir, 'commands')),
      skills: listDirs(join(dir, 'skills')),
    };
  });
}

/**
 * Persisted enabled set, mirroring resolveExclude: read
 * `.kiro/kiro-flow/plugins.json` ({enabled:[]}), add/remove names, keep only
 * names that are actually vendored, return sorted-unique.
 */
export function resolvePlugins(dir, { add = [], remove = [] } = {}) {
  const p = join(dir, PLUGINS_REL);
  let cur = [];
  if (existsSync(p)) {
    try { cur = JSON.parse(readFileSync(p, 'utf8')).enabled ?? []; } catch { /* malformed → empty */ }
  }
  const known = new Set(discoverPlugins().map((x) => x.name));
  const removeSet = new Set(remove);
  const enabled = [...new Set([...cur, ...add])]
    .filter((n) => known.has(n) && !removeSet.has(n))
    .sort();
  return enabled;
}

/** Persist the enabled set to `.kiro/kiro-flow/plugins.json`. */
export function writePlugins(dir, enabled) {
  const p = join(dir, PLUGINS_REL);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ enabled: [...enabled].sort() }, null, 2) + '\n');
}

/** extraSources for convertAgents: agent dirs of the enabled plugins that ship agents. */
export function pluginExtraSources(enabledNames, root = PLUGINS_ROOT) {
  const byName = new Map(discoverPlugins(root).map((p) => [p.name, p]));
  const out = [];
  for (const name of enabledNames) {
    const p = byName.get(name);
    if (p && p.agents.length) out.push({ dir: join(p.dir, 'agents'), category: p.category });
  }
  return out;
}

/**
 * Reconcile a workspace to the enabled set: install enabled plugins' skills +
 * commands, and remove artifacts of every vendored-but-disabled plugin. Agent
 * JSON is pruned by the caller against the conversion manifest (so a plugin
 * agent whose name collides with a base-library agent is never wrongly deleted).
 * Idempotent: safe to call on every init.
 * @param {Set<string>} emittedKfNames  kf-names the conversion actually wrote
 * @param {Iterable<string>} protect  kf-names that must never be pruned even if a
 *   plugin owns the name (kiro-flow flagships: kf-orchestrator/queen/deep-researcher)
 */
export function reconcilePlugins(dir, enabledNames, emittedKfNames = new Set(), protect = []) {
  const all = discoverPlugins();
  const enabled = new Set(enabledNames);
  const keep = new Set([...emittedKfNames, ...protect]);
  // base skill names must never be removed as if plugin-owned
  const baseSkills = new Set(listDirs(join(dir, '.claude', 'skills')));
  const summary = { installedSkills: [], installedCommands: [], removedSkills: [], removedCommands: [], prunedAgents: [] };

  for (const p of all) {
    const cmdDir = join(dir, PLUGIN_CMD_REL, p.short);
    if (enabled.has(p.name)) {
      // skills
      if (p.skills.length) {
        const { installed } = installSkills({ dir, source: join(p.dir, 'skills'), names: p.skills });
        summary.installedSkills.push(...installed);
      }
      // commands → .claude/commands/<short>/ (namespaced, resolvable by `cmd`)
      if (p.commands.length) {
        mkdirSync(cmdDir, { recursive: true });
        for (const f of p.commands) cpSync(join(p.dir, 'commands', f), join(cmdDir, f));
        summary.installedCommands.push(...p.commands.map((f) => `${p.short}/${f}`));
      }
    } else {
      // disabled → remove skills we own (never a base skill) + our command dir
      const owned = p.skills.filter((s) => !baseSkills.has(s));
      const removed = removeSkills({ dir, names: owned });
      summary.removedSkills.push(...removed);
      if (existsSync(cmdDir)) { rmSync(cmdDir, { recursive: true, force: true }); summary.removedCommands.push(p.short); }
    }
    // prune this plugin's agent JSON that is no longer emitted (unique agents of
    // a disabled plugin). Collided names stay — the base library still emits them.
    for (const kf of p.agentKfNames) {
      if (keep.has(kf)) continue;
      for (const f of [join(dir, '.kiro', 'agents', `${kf}.json`), join(dir, '.kiro', 'agents', 'prompts', `${kf}.md`)]) {
        if (existsSync(f)) { rmSync(f, { force: true }); if (!summary.prunedAgents.includes(kf)) summary.prunedAgents.push(kf); }
      }
    }
  }
  return summary;
}

/** CLI: `kiro-flow plugins <list|add|remove> [names…]`. Returns an exit code. */
export function pluginsCommand({ dir, sub, names = [], reinit }) {
  const all = discoverPlugins();
  if (!all.length) { console.error('no vendored plugins found (expected packages/kiro-flow/plugins/)'); return 1; }

  if (!sub || sub === 'list') {
    const enabled = new Set(resolvePlugins(dir));
    console.log(`port-tier plugins (${all.length} vendored, ${enabled.size} enabled):\n`);
    for (const p of all) {
      const mark = enabled.has(p.name) ? '●' : '○';
      console.log(`  ${mark} ${p.name}  (a:${p.agents.length} c:${p.commands.length} s:${p.skills.length})`);
      console.log(`      ${p.description}`);
    }
    console.log(`\n● enabled  ○ available    enable: kiro-flow plugins add <name…>`);
    return 0;
  }

  if (sub === 'add' || sub === 'remove') {
    const known = new Set(all.map((p) => p.name));
    // accept short names too (goals → ruflo-goals)
    const norm = names.map((n) => (known.has(n) ? n : known.has(`ruflo-${n}`) ? `ruflo-${n}` : n));
    const bad = norm.filter((n) => !known.has(n));
    if (!norm.length) { console.error(`usage: kiro-flow plugins ${sub} <name…>  (or --all)`); return 1; }
    if (bad.length) {
      console.error(`unknown plugin(s): ${bad.join(', ')}\navailable: ${all.map((p) => p.name).join(', ')}`);
      return 1;
    }
    const enabled = resolvePlugins(dir, sub === 'add' ? { add: norm } : { remove: norm });
    // persist + re-run the Kiro side of init so agents/skills/commands reconcile
    const summary = reinit(enabled);
    console.log(`plugins ${sub}: ${norm.join(', ')}`);
    console.log(`enabled now: ${enabled.length ? enabled.join(', ') : '(none)'}`);
    if (summary) {
      const s = summary;
      if (s.installedSkills?.length) console.log(`  + skills:   ${[...new Set(s.installedSkills)].sort().join(', ')}`);
      if (s.installedCommands?.length) console.log(`  + commands: ${s.installedCommands.join(', ')}`);
      if (s.removedSkills?.length) console.log(`  - skills:   ${[...new Set(s.removedSkills)].sort().join(', ')}`);
      if (s.removedCommands?.length) console.log(`  - commands: ${s.removedCommands.join(', ')}`);
      if (s.prunedAgents?.length) console.log(`  - agents:   ${s.prunedAgents.join(', ')}`);
      if (typeof s.emitted === 'number') console.log(`  agents converted: ${s.emitted}`);
    }
    return 0;
  }

  console.error('usage: kiro-flow plugins <list|add|remove> [name…]');
  return 1;
}
