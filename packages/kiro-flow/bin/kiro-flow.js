#!/usr/bin/env node
/**
 * kiro-flow CLI. M2 ships `convert agents`; init/daemon/swarm/doctor land in
 * later milestones (docs/plan.md).
 */
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { convertAgents } from '../src/convert/agents.mjs';

const USAGE = `kiro-flow — ruflo on AWS Kiro

Usage:
  kiro-flow convert agents [options]

Options (convert agents):
  --source <dir>      persona dir (default: .claude/agents)
  --out <dir>         output dir (default: .kiro/agents)
  --inline-prompts    embed prompt text in agent JSON instead of file://
  --dry-run           report only, write nothing
  --profiles <file>   tool-profiles.json override
  --tools-data <file> claude-flow tool-name list override
`;

const [cmd, sub, ...rest] = process.argv.slice(2);

if (cmd === 'convert' && sub === 'agents') {
  const { values } = parseArgs({
    args: rest,
    options: {
      source: { type: 'string', default: '.claude/agents' },
      out: { type: 'string', default: '.kiro/agents' },
      'inline-prompts': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      profiles: { type: 'string' },
      'tools-data': { type: 'string' },
    },
  });
  const { report } = convertAgents({
    source: resolve(values.source),
    out: resolve(values.out),
    inlinePrompts: values['inline-prompts'],
    write: !values['dry-run'],
    ...(values.profiles ? { profilesPath: resolve(values.profiles) } : {}),
    ...(values['tools-data'] ? { toolsDataPath: resolve(values['tools-data']) } : {}),
  });

  const c = report.counts;
  console.log(`converted ${c.emitted} agents (${c.sourceFiles} source files, ${c.skipped} skipped, ${c.deduped} duplicate names resolved)${values['dry-run'] ? ' [dry run]' : ` → ${values.out}`}`);
  if (report.deduped.length) {
    console.log(`\nduplicate names resolved (longest body wins):`);
    for (const d of report.deduped) console.log(`  ${d.name}: kept ${d.kept}${d.identical ? ' (identical copies)' : `, dropped ${d.dropped}`}`);
  }
  const renamed = Object.keys(report.toolRenames).length;
  const dropped = Object.keys(report.droppedTools).length;
  if (renamed) console.log(`\nv2→v3 tool renames applied in ${renamed} agents (see conversion-report.json)`);
  if (dropped) console.log(`stale/unmappable tools dropped in ${dropped} agents (see conversion-report.json)`);
  if (report.verifyAtWork.length) {
    console.log(`\nverify at work (${new Set(report.verifyAtWork).size} items) — see conversion-report.json`);
  }
} else if (cmd === '--help' || cmd === '-h' || cmd === undefined || cmd === 'help') {
  console.log(USAGE);
} else {
  console.error(`unknown command: ${[cmd, sub].filter(Boolean).join(' ')}\n\n${USAGE}`);
  process.exit(1);
}
