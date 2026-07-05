/**
 * kiro-flow power pack — assemble the team-distributable Kiro Power bundle.
 *
 * Kiro Powers are the IDE's keyword-triggered packaging format (POWER.md +
 * mcp.json + steering + assets); kiro-cli 2.10.0 has no `power` subcommand,
 * so this targets the IDE plane. The bundle carries the flagship agents and
 * enough steering to onboard a teammate in one copy:
 *
 *   powers/kiro-flow/
 *     POWER.md            keyword-triggered card (frontmatter + onboarding)
 *     mcp.json            claude-flow MCP server registration
 *     steering/ruflo.md   the ruflo steering doc
 *     agents/…            kf-orchestrator, kf-queen, kf-deep-researcher,
 *                         kf-judge (+ prompts/)
 *     README.md           install instructions (IDE / full kiro-flow init)
 *
 * The committed powers/kiro-flow snapshot is produced by this command —
 * regenerate after template changes: `kiro-flow power pack`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDeepResearcherAgent, buildOrchestratorAgent, buildQueenAgent } from './init.mjs';

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const POWER_MD = `---
name: kiro-flow
displayName: "kiro-flow — ruflo AI orchestration"
description: "Swarm orchestration, hive-mind consensus, self-learning memory and background workers for Kiro — ruflo (claude-flow) running natively on the Kiro agent stack."
keywords: [ruflo, claude-flow, swarm, hive-mind, orchestrate, agents, memory, workers, deep-research]
---

# kiro-flow

ruflo (claude-flow) on Kiro: 350 MCP tools, 70+ specialist agents, hive-mind
consensus, ambient memory with cross-session recall, background workers, and
cited deep research.

## Quickstart

- Orchestrated work: chat with **kf-orchestrator** (fan-out to specialists)
- Swarm session: \`kiro-flow hive-mind spawn -o "<objective>"\` (queen-led)
- Background workers: \`kiro-flow daemon start\`
- Cited research: chat with **kf-deep-researcher**
- Any of ruflo's 166 command prompts: \`kiro-flow cmd --list\`

Everything coordinates through the \`claude-flow\` MCP server (this Power's
mcp.json) and persists to workspace memory (\`.swarm/\`, \`.claude-flow/\`).
Decisions stored in one session are recalled automatically in the next.

## Full install

This Power carries the flagship agents only. For the full library (70+
agents, hooks, shim, learning loop):

\`\`\`
curl -fsSL https://cdn.jsdelivr.net/gh/smashkat12/kiro-flow@main/scripts/install.sh | bash
\`\`\`
`;

const README_MD = `# kiro-flow Power

Team-distributable bundle. Two ways in:

1. **Kiro IDE (Power)**: copy this directory into your Powers location; the
   keyword triggers (swarm, orchestrate, hive-mind, memory, …) surface it.
2. **Full install (CLI + IDE)**: run the one-liner in POWER.md — everything
   here plus the full agent library, hooks and the worker daemon.

Contents: POWER.md (card), mcp.json (claude-flow server), steering/ruflo.md,
agents/ (kf-orchestrator, kf-queen, kf-deep-researcher, kf-judge + prompts).

Regenerate from templates: \`kiro-flow power pack\`.
`;

export function powerPackCommand({ out }) {
  const agentsDir = join(out, 'agents');
  const promptsDir = join(agentsDir, 'prompts');
  mkdirSync(promptsDir, { recursive: true });
  mkdirSync(join(out, 'steering'), { recursive: true });

  writeFileSync(join(out, 'POWER.md'), POWER_MD);
  writeFileSync(join(out, 'README.md'), README_MD);
  writeFileSync(join(out, 'mcp.json'), readFileSync(join(pkgRoot, 'templates', 'mcp.json'), 'utf8'));
  writeFileSync(join(out, 'steering', 'ruflo.md'), readFileSync(join(pkgRoot, 'templates', 'steering-ruflo.md'), 'utf8'));

  // Flagship agents. No conversion manifest at pack time → the builders fall
  // back to the core-preference roster; sites that want rosters matching
  // their converted library should use `kiro-flow init` instead.
  const flagships = [
    ['kf-orchestrator', buildOrchestratorAgent()],
    ['kf-queen', buildQueenAgent()],
    ['kf-deep-researcher', buildDeepResearcherAgent()],
  ];
  for (const [name, agent] of flagships) {
    writeFileSync(join(agentsDir, `${name}.json`), JSON.stringify(agent, null, 2) + '\n');
    writeFileSync(join(promptsDir, `${name}.md`), readFileSync(join(pkgRoot, 'templates', 'prompts', `${name}.md`), 'utf8'));
  }
  writeFileSync(join(agentsDir, 'kf-judge.json'), readFileSync(join(pkgRoot, 'templates', 'agents', 'kf-judge.json'), 'utf8'));

  console.log(`power bundle written → ${out}`);
  console.log(`  POWER.md, mcp.json, steering/ruflo.md, agents/ (${flagships.length + 1} agents + prompts)`);
  return 0;
}
