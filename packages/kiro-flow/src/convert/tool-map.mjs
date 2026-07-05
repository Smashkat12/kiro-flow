/**
 * Tool-name mapping: Claude Code personas → Kiro custom-agent tool references.
 *
 * Kiro built-in names verified against kiro.dev/docs/cli/custom-agents/
 * configuration-reference (July 2026): `read`, `write`, `shell` (+ `knowledge`),
 * MCP refs as `@server` / `@server/tool`, wildcards `*` / `@builtin`.
 * `subagent` is Kiro's native fan-out tool (plan §Kiro capabilities) — flagged
 * verify-at-work because the docs' tools list doesn't spell it out.
 */

/** Claude Code built-in → Kiro built-in. null = no Kiro equivalent (dropped, recorded). */
export const BUILTIN_MAP = {
  Bash: 'shell',
  Read: 'read',
  Glob: 'read', // Kiro's read tool covers directory listing + search modes
  Grep: 'read',
  LS: 'read',
  NotebookRead: 'read',
  Write: 'write',
  Edit: 'write',
  MultiEdit: 'write',
  NotebookEdit: 'write',
  Task: 'subagent', // verify-at-work: native Kiro subagent tool
  TodoWrite: null,
  TodoRead: null,
  WebSearch: null, // Kiro web tools ported with skills in M9, not per-agent
  WebFetch: null,
  SlashCommand: null,
};

/** Names that need a verify-at-work flag when emitted. */
export const VERIFY_AT_WORK = new Set(['subagent']);

/**
 * ruflo v2 MCP tool names still referenced by agent frontmatter → live v3
 * names (verified against dossiers/tool-inventory.json, 350 tools).
 * A missing entry + missing live name = dropped, recorded in the report.
 */
export const CF_RENAMES = {
  task_orchestrate: ['task_create'],
  memory_usage: ['memory_store', 'memory_retrieve', 'memory_search'],
  bottleneck_analyze: ['performance_bottleneck'],
  github_code_review: ['github_pr_manage'],
  performance_report_v2: ['performance_report'],
};

/**
 * Source category directory (top level under .claude/agents/) → tool profile
 * key in templates/tool-profiles.json. Anything unlisted falls back to
 * `worker`. `NAME_PROFILE` overrides win over the directory.
 */
export const CATEGORY_PROFILE = {
  github: 'github',
  consensus: 'core',
  'hive-mind': 'core',
  swarm: 'core',
  'dual-mode': 'core',
  sublinear: 'core',
  neural: 'neural',
  sona: 'neural',
  analysis: 'researcher',
  reasoning: 'researcher',
  goal: 'researcher',
  architecture: 'researcher',
  documentation: 'researcher',
  data: 'researcher',
  optimization: 'perf',
};

/** Per-agent profile overrides (agent name, without kf- prefix). */
export const NAME_PROFILE = {
  researcher: 'researcher',
  planner: 'core',
  'code-goal-planner': 'researcher',
};

/**
 * Preference-ordered candidates for the ~12 agents the orchestrator registers
 * as available/trusted; all others stay dormant until `kiro-flow agents enable`.
 * The selection is computed against the corpus that actually converted —
 * needed because the published ruflo bundle ships a slimmer agent set than the
 * repo (3.23.0 tarball: 89 files, core/ has only planner.md), so classic names
 * like coder/researcher may be absent and v3-era fallbacks take their slots.
 */
export const CORE_AGENT_PREFERENCE = [
  // the classic 12 (full corpus)
  'coder', 'planner', 'researcher', 'reviewer', 'tester',
  'queen-coordinator', 'collective-intelligence-coordinator', 'swarm-memory-manager',
  'goal-planner', 'code-analyzer', 'backend-dev', 'pr-manager',
  // v3-era fallbacks (published-bundle corpus)
  'v3-queen-coordinator', 'hierarchical-coordinator', 'mesh-coordinator',
  'test-architect', 'production-validator', 'analyst',
  'code-goal-planner', 'sublinear-goal-planner',
  'typescript-specialist', 'python-specialist', 'v3-security-architect', 'database-specialist',
];

export const CORE_TARGET = 12;

/** Pick up to CORE_TARGET core agents (by preference order) from those present. */
export function selectCoreAgents(presentNames) {
  const present = new Set(presentNames);
  return CORE_AGENT_PREFERENCE.filter((n) => present.has(n)).slice(0, CORE_TARGET);
}

/**
 * Map one Claude Code frontmatter tool name to Kiro references.
 * @param {string} name frontmatter tool name (e.g. "Bash", "mcp__claude-flow__swarm_init")
 * @param {Set<string>} liveCfTools live claude-flow v3 tool names
 * @returns {{refs: string[], kind: 'builtin'|'claude-flow'|'mcp-other'|'dropped'|'renamed', detail?: string}}
 */
export function mapToolName(name, liveCfTools) {
  const mcp = /^mcp__([^_]+(?:[^_]|_(?!_))*)__(.+)$/.exec(name);
  if (mcp) {
    const [, server, tool] = mcp;
    if (server === 'claude-flow') {
      if (liveCfTools.has(tool)) return { refs: [`@claude-flow/${tool}`], kind: 'claude-flow' };
      const renamed = CF_RENAMES[tool];
      if (renamed) {
        return {
          refs: renamed.filter((t) => liveCfTools.has(t)).map((t) => `@claude-flow/${t}`),
          kind: 'renamed',
          detail: `${tool} → ${renamed.join(', ')}`,
        };
      }
      return { refs: [], kind: 'dropped', detail: `${name}: no v3 equivalent` };
    }
    // other MCP servers (github, flow-nexus, …): keep the reference; the
    // user must register that server themselves for it to resolve.
    return { refs: [`@${server}/${tool}`], kind: 'mcp-other' };
  }
  if (name in BUILTIN_MAP) {
    const mapped = BUILTIN_MAP[name];
    if (mapped === null) return { refs: [], kind: 'dropped', detail: `${name}: no Kiro equivalent` };
    return { refs: [mapped], kind: 'builtin' };
  }
  return { refs: [], kind: 'dropped', detail: `${name}: unknown tool name` };
}
