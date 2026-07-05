/**
 * kiro-flow convert agents — turn ruflo's .claude/agents/**\/*.md personas
 * into Kiro custom agents (.kiro/agents/kf-<name>.json + prompts/).
 *
 * Conversion policy (dossiers/02-agent-library.md):
 *   - templates/ dir and `type: documentation` files are skipped
 *   - duplicate frontmatter names: longest body wins, tie → first path
 *   - frontmatter tools are mapped via tool-map.mjs; agents without a tools
 *     line get built-ins + their category profile's claude-flow allowlist
 *   - agent JSON stays lean: prompt via file://, MCP via includeMcpJson
 *     (workspace mcp.json registers server key `claude-flow`, see M1)
 */
import {
  mkdirSync, readdirSync, readFileSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, parseToolList } from './frontmatter.mjs';
import {
  CATEGORY_PROFILE, NAME_PROFILE, VERIFY_AT_WORK, mapToolName, selectCoreAgents,
} from './tool-map.mjs';

const pkgRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const DEFAULT_TOOLS_DATA = join(pkgRoot, 'data', 'claude-flow-tools.json');
export const DEFAULT_PROFILES = join(pkgRoot, 'templates', 'tool-profiles.json');

const BASE_BUILTINS = ['read', 'write', 'shell'];

/** Where init copies the hook adapter, relative to the workspace root. */
export const HOOK_ADAPTER_REL = '.kiro/kiro-flow/kiro-hook-adapter.cjs';

/**
 * The standard kf hook block: mirrors the hooks `ruflo init` writes into
 * .claude/settings.json, mapped onto Kiro's 5 events through the adapter
 * (dossier 04). Same shape for every agent so sites stay diffable.
 */
export function buildKfHooks() {
  const run = (...specs) => `node ${HOOK_ADAPTER_REL} ${specs.join(' ')}`;
  return {
    agentSpawn: [{ command: run('session-restore', 'auto-memory:import') }],
    userPromptSubmit: [{ command: run('route') }],
    preToolUse: [
      { matcher: 'execute_bash', command: run('pre-bash') },
      { matcher: 'fs_write', command: run('pre-edit') },
    ],
    postToolUse: [
      { matcher: 'fs_write', command: run('post-edit') },
      { matcher: 'execute_bash', command: run('post-bash') },
    ],
    stop: [{ command: run('session-end', 'auto-memory:sync') }],
  };
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith('.md')) out.push(p);
  }
  return out;
}

function sanitizeName(raw) {
  const s = raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '');
  if (!/^[a-z0-9]/.test(s)) throw new Error(`cannot sanitize agent name: ${raw}`);
  return s;
}

/** Expand a profile (category list + extraTools) to live claude-flow tool names. */
export function expandProfile(profile, liveCfTools) {
  const cats = new Set(profile.categories ?? []);
  const all = [...liveCfTools].sort();
  const names = cats.has('*')
    ? all
    : all.filter((n) => cats.has(n.includes('_') ? n.split('_')[0] : '(other)'));
  for (const extra of profile.extraTools ?? []) {
    if (liveCfTools.has(extra) && !names.includes(extra)) names.push(extra);
  }
  return names.sort();
}

function categoryOf(relPath) {
  const parts = relPath.split(sep);
  return parts.length > 1 ? parts[0] : '(root)';
}

function profileFor(name, category) {
  return NAME_PROFILE[name] ?? CATEGORY_PROFILE[category] ?? 'worker';
}

/** Order: built-ins, subagent, @claude-flow/* sorted, other @server/* sorted. */
function sortToolRefs(refs) {
  const rank = (r) =>
    BASE_BUILTINS.includes(r) ? 0 : r === 'subagent' ? 1 : r.startsWith('@claude-flow/') ? 2 : 3;
  return [...new Set(refs)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * Convert one parsed persona into its Kiro agent JSON + prompt body.
 * Exported for unit tests.
 */
export function buildAgent({ name, attrs, body, category }, ctx) {
  const { liveCfTools, profiles, inlinePrompts, report } = ctx;
  const kfName = `kf-${name}`;
  const profileKey = profileFor(name, category);
  const profileTools = ctx.profileCache.get(profileKey)
    ?? ctx.profileCache
      .set(profileKey, expandProfile(profiles[profileKey], liveCfTools))
      .get(profileKey);

  const cfTools = new Set(profileTools);
  const extraRefs = [];
  for (const t of parseToolList(attrs.tools)) {
    const m = mapToolName(t, liveCfTools);
    if (m.kind === 'dropped') {
      (report.droppedTools[kfName] ??= []).push(m.detail);
      continue;
    }
    if (m.kind === 'renamed') (report.toolRenames[kfName] ??= []).push(m.detail);
    for (const ref of m.refs) {
      if (ref.startsWith('@claude-flow/')) cfTools.add(ref.slice('@claude-flow/'.length));
      else extraRefs.push(ref);
      if (VERIFY_AT_WORK.has(ref)) {
        report.verifyAtWork.push(`${kfName}: uses '${ref}' (Task tool mapping)`);
      }
      if (ref.startsWith('@') && !ref.startsWith('@claude-flow/')) {
        report.verifyAtWork.push(`${kfName}: references ${ref} — that MCP server must be registered separately`);
      }
    }
  }

  const cfRefs = [...cfTools].sort().map((t) => `@claude-flow/${t}`);
  const tools = sortToolRefs([...BASE_BUILTINS, ...extraRefs, ...cfRefs]);
  const allowedTools = ['read', ...cfRefs];

  const description = (attrs.description ?? '').replace(/\s+/g, ' ').trim() || name;
  const json = {
    $schema: 'https://github.com/smashkat12/kiro-flow/schemas/kiro-agent.schema.json',
    name: kfName,
    description,
    prompt: inlinePrompts ? body : `file://./prompts/${kfName}.md`,
    tools,
    allowedTools,
    ...(ctx.hooks ? { hooks: buildKfHooks() } : {}),
    includeMcpJson: true,
  };
  return { json, promptBody: body, profileKey };
}

/**
 * @param {object} opts
 * @param {string} opts.source   dir containing the .md personas
 * @param {string} opts.out      output dir (.kiro/agents)
 * @param {string} [opts.profilesPath]
 * @param {string} [opts.toolsDataPath]
 * @param {boolean} [opts.inlinePrompts]
 * @param {boolean} [opts.write=true]  false = dry run (nothing written)
 * @param {boolean} [opts.hooks=true]  inject the kf hook block (adapter → ruflo handlers)
 */
export function convertAgents(opts) {
  const {
    source, out,
    profilesPath = DEFAULT_PROFILES,
    toolsDataPath = DEFAULT_TOOLS_DATA,
    inlinePrompts = false,
    write = true,
    hooks = true,
  } = opts;

  const liveCfTools = new Set(JSON.parse(readFileSync(toolsDataPath, 'utf8')));
  const profiles = JSON.parse(readFileSync(profilesPath, 'utf8'));

  const report = {
    generatedBy: 'kiro-flow convert agents',
    source: source.toString(),
    counts: {},
    skipped: [],
    deduped: [],
    toolRenames: {},
    droppedTools: {},
    verifyAtWork: [],
  };

  // ── discover + parse ──
  const parsed = [];
  for (const file of walk(source).sort()) {
    const rel = relative(source, file);
    if (rel.split(sep)[0] === 'templates') {
      report.skipped.push({ file: rel, reason: 'templates directory (not live personas)' });
      continue;
    }
    const { attrs, body, hasFrontmatter } = parseFrontmatter(readFileSync(file, 'utf8'));
    if (!hasFrontmatter || !attrs.name) {
      report.skipped.push({ file: rel, reason: 'no frontmatter name' });
      continue;
    }
    if (attrs.type === 'documentation') {
      report.skipped.push({ file: rel, reason: 'type: documentation' });
      continue;
    }
    parsed.push({ rel, name: sanitizeName(attrs.name), attrs, body });
  }

  // ── dedup by agent name: longest body wins, tie → first path ──
  const byName = new Map();
  for (const p of parsed) {
    const cur = byName.get(p.name);
    if (!cur) { byName.set(p.name, p); continue; }
    const winner =
      p.body.length > cur.body.length ? p
      : p.body.length < cur.body.length ? cur
      : [p, cur].sort((a, b) => a.rel.localeCompare(b.rel))[0];
    const loser = winner === p ? cur : p;
    byName.set(p.name, winner);
    report.deduped.push({
      name: p.name,
      kept: winner.rel,
      dropped: loser.rel,
      identical: winner.body === loser.body,
    });
  }

  // ── build + emit ──
  const ctx = { liveCfTools, profiles, inlinePrompts, hooks, report, profileCache: new Map() };
  const coreSet = new Set(selectCoreAgents([...byName.keys()]));
  const manifest = [];
  const agents = [];
  for (const p of [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const category = categoryOf(p.rel);
    const { json, promptBody, profileKey } = buildAgent({ ...p, category }, ctx);
    agents.push({ json, promptBody });
    manifest.push({
      name: json.name,
      source: p.rel,
      category,
      profile: profileKey,
      core: coreSet.has(p.name),
      enabled: true,
    });
  }

  report.counts = {
    sourceFiles: walk(source).length,
    parsed: parsed.length,
    skipped: report.skipped.length,
    deduped: report.deduped.length,
    emitted: agents.length,
  };

  if (write) {
    mkdirSync(join(out, 'prompts'), { recursive: true });
    for (const { json, promptBody } of agents) {
      writeFileSync(join(out, `${json.name}.json`), JSON.stringify(json, null, 2) + '\n');
      if (!inlinePrompts) {
        writeFileSync(join(out, 'prompts', `${json.name}.md`), promptBody);
      }
    }
    const metaDir = join(out, '..', 'kiro-flow');
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(join(metaDir, 'agents-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    writeFileSync(join(metaDir, 'conversion-report.json'), JSON.stringify(report, null, 2) + '\n');
  }

  return { agents, manifest, report };
}
