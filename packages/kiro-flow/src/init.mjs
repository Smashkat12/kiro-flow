/**
 * kiro-flow init — one command to make a workspace ruflo-on-Kiro:
 *
 *   1. `npx ruflo init --yes --no-global` + `init upgrade --add-missing`
 *      (skipped if already initialized; --no-global keeps ~/.claude/CLAUDE.md
 *      untouched; the upgrade pass pulls the full bundled agent library)
 *   2. convert .claude/agents → .kiro/agents (M2 converter)
 *   3. register the MCP server: workspace mcp.json (CLI) + .kiro/settings/
 *      mcp.json (IDE), server key `claude-flow`, merged non-destructively
 *   4. steering file .kiro/steering/ruflo.md
 *   5. hook adapter .kiro/kiro-flow/kiro-hook-adapter.cjs (M4 — every generated
 *      agent's hooks delegate through it to ruflo's .claude/helpers kernel)
 *   6. kiro-claude-shim .kiro/kiro-flow/shim/claude (M5 — headless worker plane)
 *   7. kf-judge → ~/.kiro/agents (global; M8 — judge calls run in a temp cwd)
 *   8. kf-orchestrator + kf-queen agents (subagent fan-out / hive-mind plane)
 *
 * Every write is compare-before-write, so a second run is a zero-diff no-op.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildKfHooks, convertAgents, expandProfile,
  DEFAULT_PROFILES, DEFAULT_TOOLS_DATA, HOOK_ADAPTER_REL,
} from './convert/agents.mjs';
import { CORE_AGENT_PREFERENCE, CORE_TARGET } from './convert/tool-map.mjs';
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

/**
 * @param {string[]} [coreKfNames] the kf-* agents to register with the
 * subagent tool — pass the manifest's core selection so the orchestrator only
 * references agents that actually exist in this workspace. Falls back to the
 * first CORE_TARGET preference names when no manifest is available.
 */
export function buildOrchestratorAgent(coreKfNames) {
  const liveCfTools = new Set(JSON.parse(readFileSync(DEFAULT_TOOLS_DATA, 'utf8')));
  const profiles = JSON.parse(readFileSync(DEFAULT_PROFILES, 'utf8'));
  const cfRefs = expandProfile(profiles.core, liveCfTools).map((t) => `@claude-flow/${t}`);
  const kfCore = coreKfNames?.length
    ? [...coreKfNames].sort()
    : CORE_AGENT_PREFERENCE.slice(0, CORE_TARGET).map((n) => `kf-${n}`);
  return {
    $schema: 'https://github.com/smashkat12/kiro-flow/schemas/kiro-agent.schema.json',
    name: 'kf-orchestrator',
    description: 'ruflo orchestrator for Kiro — coordinates the kf-* agent library via subagent fan-out and claude-flow swarm/memory tools',
    prompt: 'file://./prompts/kf-orchestrator.md',
    tools: ['read', 'write', 'shell', 'subagent', ...cfRefs],
    allowedTools: ['read', ...cfRefs],
    toolsSettings: {
      subagent: { availableAgents: kfCore, trustedAgents: kfCore },
    },
    hooks: buildKfHooks(),
    includeMcpJson: true,
  };
}

/**
 * kf-queen — the hive-mind interactive plane (M6). Same shape as the
 * orchestrator, but with the queen persona and the hive/consensus toolset;
 * `kiro-flow hive-mind spawn` launches kiro-cli chat with this agent.
 */
export function buildQueenAgent(coreKfNames) {
  const liveCfTools = new Set(JSON.parse(readFileSync(DEFAULT_TOOLS_DATA, 'utf8')));
  const profiles = JSON.parse(readFileSync(DEFAULT_PROFILES, 'utf8'));
  const cfNames = expandProfile(profiles.core, liveCfTools);
  // the generated hive briefing also references these beyond the core profile
  for (const extra of ['neural_patterns', 'neural_train', 'workflow_create', 'hooks_intelligence_pattern-store']) {
    if (liveCfTools.has(extra) && !cfNames.includes(extra)) cfNames.push(extra);
  }
  const cfRefs = cfNames.sort().map((t) => `@claude-flow/${t}`);
  const kfCore = coreKfNames?.length
    ? [...coreKfNames].sort()
    : CORE_AGENT_PREFERENCE.slice(0, CORE_TARGET).map((n) => `kf-${n}`);
  return {
    $schema: 'https://github.com/smashkat12/kiro-flow/schemas/kiro-agent.schema.json',
    name: 'kf-queen',
    description: 'ruflo hive-mind queen for Kiro — consensus-led swarm coordination via claude-flow hive tools, execution via subagent fan-out',
    prompt: 'file://./prompts/kf-queen.md',
    tools: ['read', 'write', 'shell', 'subagent', ...cfRefs],
    allowedTools: ['read', ...cfRefs],
    toolsSettings: {
      subagent: { availableAgents: kfCore, trustedAgents: kfCore },
    },
    hooks: buildKfHooks(),
    includeMcpJson: true,
  };
}

/**
 * kf-deep-researcher — the deep-research plane (M9). Kiro-native web_search/
 * web_fetch + the researcher tool profile; produces cited reports and
 * persists findings via memory_store.
 */
export function buildDeepResearcherAgent() {
  const liveCfTools = new Set(JSON.parse(readFileSync(DEFAULT_TOOLS_DATA, 'utf8')));
  const profiles = JSON.parse(readFileSync(DEFAULT_PROFILES, 'utf8'));
  const cfNames = expandProfile(profiles.researcher, liveCfTools);
  if (liveCfTools.has('memory_store') && !cfNames.includes('memory_store')) cfNames.push('memory_store');
  const cfRefs = cfNames.sort().map((t) => `@claude-flow/${t}`);
  return {
    $schema: 'https://github.com/smashkat12/kiro-flow/schemas/kiro-agent.schema.json',
    name: 'kf-deep-researcher',
    description: 'ruflo deep-research for Kiro — multi-angle web research with verified citations; findings persisted to claude-flow memory',
    prompt: 'file://./prompts/kf-deep-researcher.md',
    tools: ['read', 'write', 'web_search', 'web_fetch', ...cfRefs],
    allowedTools: ['read', 'web_search', 'web_fetch', ...cfRefs],
    hooks: buildKfHooks(),
    includeMcpJson: true,
  };
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
 * @returns {{steps: Array<{step: string, status: string, detail?: string}>}}
 */
export function initWorkspace({ dir, force = false, skipRufloInit = false }) {
  const steps = [];
  const step = (name, status, detail) => steps.push({ step: name, status, ...(detail ? { detail } : {}) });

  // 1. ruflo init
  const rufloInitialized = existsSync(join(dir, '.claude', 'settings.json'));
  if (skipRufloInit) {
    step('ruflo init', 'skipped', 'disabled by flag');
  } else if (rufloInitialized && !force) {
    step('ruflo init', 'skipped', '.claude/settings.json exists (use --force to rerun)');
  } else {
    runRufloInit(dir, { force });
    step('ruflo init', 'done', `${RUFLO_SPEC} init --yes --no-global + upgrade --add-missing (full agent library)`);
  }

  // 2. convert agents
  const agentSource = join(dir, '.claude', 'agents');
  let coreKfNames;
  if (existsSync(agentSource)) {
    const { report, manifest } = convertAgents({ source: agentSource, out: join(dir, '.kiro', 'agents') });
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
  // spawns in an empty temp cwd where workspace agents are invisible (M8)
  const judgeSrc = readFileSync(join(pkgRoot, 'templates', 'agents', 'kf-judge.json'), 'utf8');
  step('~/.kiro/agents/kf-judge.json (global)', writeIfChanged(join(homedir(), '.kiro', 'agents', 'kf-judge.json'), judgeSrc));

  // 8. orchestrator + queen agents
  for (const [name, agent] of [
    ['kf-orchestrator', buildOrchestratorAgent(coreKfNames)],
    ['kf-queen', buildQueenAgent(coreKfNames)],
    ['kf-deep-researcher', buildDeepResearcherAgent()],
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

  return { steps };
}
