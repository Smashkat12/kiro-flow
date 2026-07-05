/**
 * kiro-flow init — one command to make a workspace ruflo-on-Kiro:
 *
 *   1. `npx ruflo init --yes --no-global` + `init upgrade --add-missing`
 *      (skipped if already initialized; --no-global keeps ~/.claude/CLAUDE.md
 *      untouched; the upgrade pass pulls the full bundled agent library)
 *   2. resolve the model-routing map (.kiro/kiro-flow/model-map.json, M11 #3),
 *      then convert .claude/agents → .kiro/agents (M2 converter) with native
 *      tool budgets + per-role model routing baked into each agent
 *   3. register the MCP server: workspace mcp.json (CLI) + .kiro/settings/
 *      mcp.json (IDE), server key `claude-flow`, merged non-destructively
 *   4. steering file .kiro/steering/ruflo.md
 *   5. hook adapter .kiro/kiro-flow/kiro-hook-adapter.cjs (M4 — every generated
 *      agent's hooks delegate through it to ruflo's .claude/helpers kernel)
 *   6. kiro-claude-shim .kiro/kiro-flow/shim/claude (M5 — headless worker plane)
 *   7. kf-judge → ~/.kiro/agents (global; M8 — judge calls run in a temp cwd)
 *   8. kf-orchestrator + kf-queen + kf-deep-researcher agents
 *   9. clean inert Claude-Code files (CLAUDE.md, .claude/settings.json,
 *      .mcp.json — Kiro reads none; --keep-cc to skip)
 *
 * Every write is compare-before-write, so a second run is a zero-diff no-op.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildKfHooks, convertAgents, expandProfile,
  DEFAULT_PROFILES, DEFAULT_TOOLS_DATA, HOOK_ADAPTER_REL,
} from './convert/agents.mjs';
import {
  CORE_AGENT_PREFERENCE, CORE_TARGET, DEFAULT_MODEL_MAP, nativeToolsFor, flagshipModel,
} from './convert/tool-map.mjs';
import { syncBinShim } from './daemon.mjs';

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const RUFLO_SPEC = process.env.KIRO_FLOW_RUFLO_SPEC ?? 'ruflo@~3.23.0';

/** Write only when content differs. Returns 'created' | 'updated' | 'unchanged'. */
function writeIfChanged(path, content) {
  if (existsSync(path)) {
    if (readFileSync(path, 'utf8') === content) return 'unchanged';
    writeFileSync(path, content);
    return 'updated';
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return 'created';
}

/** Merge the claude-flow server block into an mcp.json, preserving other servers. */
function mergeMcpJson(path, serverBlock) {
  let existing = {};
  if (existsSync(path)) {
    try { existing = JSON.parse(readFileSync(path, 'utf8')); } catch { existing = {}; }
  }
  const merged = {
    ...existing,
    mcpServers: { ...(existing.mcpServers ?? {}), 'claude-flow': serverBlock },
  };
  return writeIfChanged(path, JSON.stringify(merged, null, 2) + '\n');
}

/** Path of the workspace model-routing override file (M11 #3). */
export const MODEL_MAP_REL = join('.kiro', 'kiro-flow', 'model-map.json');

/**
 * Resolve the tier→model-id map for a workspace: the committed default merged
 * with any workspace override at `.kiro/kiro-flow/model-map.json`. The override
 * is the single file to edit when the employer's Kiro exposes different model
 * IDs than the home free tier (`kiro-flow doctor` flags a pinned id that
 * `kiro-cli chat --list-models` doesn't offer).
 */
export function resolveModelMap(dir) {
  const p = join(dir, MODEL_MAP_REL);
  if (existsSync(p)) {
    try { return { ...DEFAULT_MODEL_MAP, ...JSON.parse(readFileSync(p, 'utf8')) }; }
    catch { /* malformed → fall back to default */ }
  }
  return DEFAULT_MODEL_MAP;
}

/**
 * @param {string[]} [coreKfNames] the kf-* agents to register with the
 * subagent tool — pass the manifest's core selection so the orchestrator only
 * references agents that actually exist in this workspace. Falls back to the
 * first CORE_TARGET preference names when no manifest is available.
 */
export function buildOrchestratorAgent(coreKfNames, model = flagshipModel()) {
  const liveCfTools = new Set(JSON.parse(readFileSync(DEFAULT_TOOLS_DATA, 'utf8')));
  const profiles = JSON.parse(readFileSync(DEFAULT_PROFILES, 'utf8'));
  const cfRefs = expandProfile(profiles.core, liveCfTools).map((t) => `@claude-flow/${t}`);
  const native = nativeToolsFor('core');
  const kfCore = coreKfNames?.length
    ? [...coreKfNames].sort()
    : CORE_AGENT_PREFERENCE.slice(0, CORE_TARGET).map((n) => `kf-${n}`);
  return {
    $schema: 'https://github.com/smashkat12/kiro-flow/schemas/kiro-agent.schema.json',
    name: 'kf-orchestrator',
    description: 'ruflo orchestrator for Kiro — coordinates the kf-* agent library via subagent fan-out and claude-flow swarm/memory tools',
    prompt: 'file://./prompts/kf-orchestrator.md',
    ...(model ? { model } : {}),
    tools: ['read', 'write', 'shell', ...native, 'subagent', ...cfRefs],
    allowedTools: ['read', ...native, ...cfRefs],
    toolsSettings: {
      subagent: { availableAgents: kfCore, trustedAgents: kfCore },
    },
    // M11 leftovers — flagship UX (interactive planes only; NEVER on headless
    // agents: a welcome would corrupt the shim's parsed output).
    welcomeMessage: 'kf-orchestrator — I coordinate the kf-* agent library via native subagent fan-out + claude-flow swarm/memory. Give me an objective and I delegate. Try: "Build X: fan out to kf-backend-dev and kf-tester, then store the plan in memory."',
    keyboardShortcut: 'ctrl+alt+o',
    hooks: buildKfHooks(),
    includeMcpJson: true,
  };
}

/**
 * kf-queen — the hive-mind interactive plane (M6). Same shape as the
 * orchestrator, but with the queen persona and the hive/consensus toolset;
 * `kiro-flow hive-mind spawn` launches kiro-cli chat with this agent.
 */
export function buildQueenAgent(coreKfNames, model = flagshipModel()) {
  const liveCfTools = new Set(JSON.parse(readFileSync(DEFAULT_TOOLS_DATA, 'utf8')));
  const profiles = JSON.parse(readFileSync(DEFAULT_PROFILES, 'utf8'));
  const cfNames = expandProfile(profiles.core, liveCfTools);
  // the generated hive briefing also references these beyond the core profile
  for (const extra of ['neural_patterns', 'neural_train', 'workflow_create', 'hooks_intelligence_pattern-store']) {
    if (liveCfTools.has(extra) && !cfNames.includes(extra)) cfNames.push(extra);
  }
  const cfRefs = cfNames.sort().map((t) => `@claude-flow/${t}`);
  const native = nativeToolsFor('core');
  const kfCore = coreKfNames?.length
    ? [...coreKfNames].sort()
    : CORE_AGENT_PREFERENCE.slice(0, CORE_TARGET).map((n) => `kf-${n}`);
  return {
    $schema: 'https://github.com/smashkat12/kiro-flow/schemas/kiro-agent.schema.json',
    name: 'kf-queen',
    description: 'ruflo hive-mind queen for Kiro — consensus-led swarm coordination via claude-flow hive tools, execution via subagent fan-out',
    prompt: 'file://./prompts/kf-queen.md',
    ...(model ? { model } : {}),
    tools: ['read', 'write', 'shell', ...native, 'subagent', ...cfRefs],
    allowedTools: ['read', ...native, ...cfRefs],
    toolsSettings: {
      subagent: { availableAgents: kfCore, trustedAgents: kfCore },
    },
    welcomeMessage: 'kf-queen — hive-mind coordinator. I run consensus-led swarms over claude-flow hive tools and fan out to specialist agents. Give me an objective; I convene, delegate, and reconcile. Try: "Ship feature Y with a 3-agent swarm and byzantine consensus on the design."',
    keyboardShortcut: 'ctrl+alt+q',
    hooks: buildKfHooks(),
    includeMcpJson: true,
  };
}

/**
 * kf-deep-researcher — the deep-research plane (M9). Kiro-native web_search/
 * web_fetch + the researcher tool profile; produces cited reports and
 * persists findings via memory_store.
 */
export function buildDeepResearcherAgent(model = flagshipModel()) {
  const liveCfTools = new Set(JSON.parse(readFileSync(DEFAULT_TOOLS_DATA, 'utf8')));
  const profiles = JSON.parse(readFileSync(DEFAULT_PROFILES, 'utf8'));
  const cfNames = expandProfile(profiles.researcher, liveCfTools);
  if (liveCfTools.has('memory_store') && !cfNames.includes('memory_store')) cfNames.push('memory_store');
  const cfRefs = cfNames.sort().map((t) => `@claude-flow/${t}`);
  const native = nativeToolsFor('researcher');
  return {
    $schema: 'https://github.com/smashkat12/kiro-flow/schemas/kiro-agent.schema.json',
    name: 'kf-deep-researcher',
    description: 'ruflo deep-research for Kiro — multi-angle web research with verified citations; findings persisted to claude-flow memory',
    prompt: 'file://./prompts/kf-deep-researcher.md',
    ...(model ? { model } : {}),
    tools: ['read', 'write', ...native, 'web_search', 'web_fetch', ...cfRefs],
    allowedTools: ['read', ...native, 'web_search', 'web_fetch', ...cfRefs],
    welcomeMessage: 'kf-deep-researcher — multi-angle web research with verified citations, findings persisted to claude-flow memory. Give me a question; I gather, cross-check, and cite. Try: "Research the tradeoffs of X vs Y and store a cited summary."',
    keyboardShortcut: 'ctrl+alt+r',
    hooks: buildKfHooks(),
    includeMcpJson: true,
  };
}

/**
 * Files `ruflo init` writes that are Claude-Code-only and inert on Kiro
 * (verified: the ruflo hook kernel reads none of these at runtime; Kiro reads
 * .kiro/steering, .kiro/agents/*.json hooks, and mcp.json / .kiro/settings/
 * mcp.json instead). Safe to remove on a Kiro-only machine. The load-bearing
 * `.claude/helpers/`, `.claude/commands/`, and all of `.claude-flow/` are NOT
 * in this list.
 */
export const INERT_CC_FILES = [
  'CLAUDE.md',
  'CLAUDE.local.md',
  join('.claude', 'settings.json'),
  join('.claude', 'settings.local.json'),
  '.mcp.json',
];

/** Remove the inert Claude-Code files from a workspace. Returns removed rel paths. */
export function cleanClaudeCode(dir) {
  const removed = [];
  for (const rel of INERT_CC_FILES) {
    const p = join(dir, rel);
    if (existsSync(p)) { rmSync(p, { force: true }); removed.push(rel); }
  }
  return removed;
}

function npxRuflo(dir, args) {
  execFileSync('npx', ['-y', RUFLO_SPEC, ...args], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 300_000,
    env: { ...process.env, CLAUDE_FLOW_SETUP_MCP: '0' },
  });
}

function runRufloInit(dir, { force }) {
  // --all-agents is a dead flag in the published 3.23.0 (parser camelCases to
  // flags.allAgents, init.ts reads flags['all-agents'] — same bug class as
  // upstream #2098A). `init upgrade --add-missing` reads both spellings and
  // copies every bundled agent category, so chain it to get the full library.
  npxRuflo(dir, ['init', '--yes', '--no-global', ...(force ? ['--force'] : [])]);
  npxRuflo(dir, ['init', 'upgrade', '--add-missing']);
}

/**
 * @param {object} opts
 * @param {string} opts.dir            target workspace
 * @param {boolean} [opts.force]
 * @param {boolean} [opts.skipRufloInit]  tests / already-initialized workspaces
 * @param {boolean} [opts.cleanCc]  remove inert Claude-Code files after init (default true)
 * @returns {{steps: Array<{step: string, status: string, detail?: string}>}}
 */
export function initWorkspace({ dir, force = false, skipRufloInit = false, cleanCc = true }) {
  const steps = [];
  const step = (name, status, detail) => steps.push({ step: name, status, ...(detail ? { detail } : {}) });

  // 1. ruflo init. Sentinel is the hook kernel (.claude/helpers/hook-handler.cjs),
  // NOT .claude/settings.json — clean-cc removes settings.json, and the sentinel
  // must key off a file we keep so re-runs stay a fast no-op.
  const rufloInitialized = existsSync(join(dir, '.claude', 'helpers', 'hook-handler.cjs'));
  if (skipRufloInit) {
    step('ruflo init', 'skipped', 'disabled by flag');
  } else if (rufloInitialized && !force) {
    step('ruflo init', 'skipped', '.claude/helpers exists (use --force to rerun)');
  } else {
    runRufloInit(dir, { force });
    step('ruflo init', 'done', `${RUFLO_SPEC} init --yes --no-global + upgrade --add-missing (full agent library)`);
  }

  // 2a. model routing map (M11 #3) — one editable file for the whole workspace;
  // resolved before conversion so every agent is routed consistently.
  const modelMap = resolveModelMap(dir);
  step(MODEL_MAP_REL, writeIfChanged(join(dir, MODEL_MAP_REL), JSON.stringify(modelMap, null, 2) + '\n'));

  // 2. convert agents
  const agentSource = join(dir, '.claude', 'agents');
  let coreKfNames;
  if (existsSync(agentSource)) {
    const { report, manifest } = convertAgents({ source: agentSource, out: join(dir, '.kiro', 'agents'), modelMap });
    coreKfNames = manifest.filter((a) => a.core).map((a) => a.name);
    step('convert agents', 'done', `${report.counts.emitted} agents (${report.counts.skipped} skipped, ${report.counts.deduped} deduped; core: ${coreKfNames.length})`);
  } else {
    step('convert agents', 'skipped', 'no .claude/agents directory');
  }

  // 3. MCP registration (workspace mcp.json for CLI, .kiro/settings/mcp.json for IDE)
  const serverBlock = JSON.parse(readFileSync(join(pkgRoot, 'templates', 'mcp.json'), 'utf8')).mcpServers['claude-flow'];
  step('mcp.json (CLI)', mergeMcpJson(join(dir, 'mcp.json'), serverBlock));
  step('.kiro/settings/mcp.json (IDE)', mergeMcpJson(join(dir, '.kiro', 'settings', 'mcp.json'), serverBlock));

  // 4. steering
  const steering = readFileSync(join(pkgRoot, 'templates', 'steering-ruflo.md'), 'utf8');
  step('.kiro/steering/ruflo.md', writeIfChanged(join(dir, '.kiro', 'steering', 'ruflo.md'), steering));

  // 5. hook adapter (agents' hook blocks all point at this file)
  const adapter = readFileSync(join(pkgRoot, 'templates', 'kiro-hook-adapter.cjs'), 'utf8');
  step(HOOK_ADAPTER_REL, writeIfChanged(join(dir, HOOK_ADAPTER_REL), adapter));

  // 6. kiro-claude-shim (headless worker plane — M5). The binary must be named
  // exactly `claude` and be executable for ruflo's PATH-lookup spawns to hit it.
  const shimDest = join(dir, '.kiro', 'kiro-flow', 'shim');
  const shimStatus = writeIfChanged(join(shimDest, 'claude'), readFileSync(join(pkgRoot, 'shim', 'claude'), 'utf8'));
  chmodSync(join(shimDest, 'claude'), 0o755);
  writeIfChanged(join(shimDest, 'package.json'), readFileSync(join(pkgRoot, 'shim', 'package.json'), 'utf8'));
  step('.kiro/kiro-flow/shim/claude', shimStatus);
  // Plant the workspace node_modules/.bin/claude symlink now, not only at
  // daemon time: on machines with no Claude Code at all (work laptops), this
  // makes even a bare `npx ruflo daemon start --headless` resolve the shim.
  // npm installs may clear it; kiro-flow daemon/worker re-plant on every run.
  syncBinShim(dir, 'kiro');
  step('node_modules/.bin/claude → shim', 'ok');

  // 7. kf-judge — installed GLOBALLY (~/.kiro/agents): the fable/judge plane
  // spawns in an empty temp cwd where workspace agents are invisible (M8). The
  // judge is a verifier → strong tier, routed through the same model map.
  const judge = JSON.parse(readFileSync(join(pkgRoot, 'templates', 'agents', 'kf-judge.json'), 'utf8'));
  const judgeModel = flagshipModel(modelMap);
  if (judgeModel) judge.model = judgeModel; else delete judge.model;
  step('~/.kiro/agents/kf-judge.json (global)', writeIfChanged(join(homedir(), '.kiro', 'agents', 'kf-judge.json'), JSON.stringify(judge, null, 2) + '\n'));

  // 8. orchestrator + queen agents
  for (const [name, agent] of [
    ['kf-orchestrator', buildOrchestratorAgent(coreKfNames, flagshipModel(modelMap))],
    ['kf-queen', buildQueenAgent(coreKfNames, flagshipModel(modelMap))],
    ['kf-deep-researcher', buildDeepResearcherAgent(flagshipModel(modelMap))],
  ]) {
    step(`.kiro/agents/${name}.json`, writeIfChanged(
      join(dir, '.kiro', 'agents', `${name}.json`),
      JSON.stringify(agent, null, 2) + '\n',
    ));
    const promptBody = readFileSync(join(pkgRoot, 'templates', 'prompts', `${name}.md`), 'utf8');
    step(`.kiro/agents/prompts/${name}.md`, writeIfChanged(
      join(dir, '.kiro', 'agents', 'prompts', `${name}.md`),
      promptBody,
    ));
  }

  // 9. clean up inert Claude-Code files (Kiro reads none of them) unless kept
  if (cleanCc) {
    const removed = cleanClaudeCode(dir);
    step('clean Claude-Code files', removed.length ? 'done' : 'unchanged',
      removed.length ? `removed ${removed.join(', ')}` : 'none present');
  } else {
    step('clean Claude-Code files', 'skipped', '--keep-cc');
  }

  return { steps };
}
