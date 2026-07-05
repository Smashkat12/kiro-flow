#!/usr/bin/env node
/**
 * kiro-flow CLI. M2 ships `convert agents`; init/daemon/swarm/doctor land in
 * later milestones (docs/plan.md).
 */
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { convertAgents } from '../src/convert/agents.mjs';
import { initWorkspace } from '../src/init.mjs';
import { runDoctor, formatDoctorReport } from '../src/doctor.mjs';

const USAGE = `kiro-flow — ruflo on AWS Kiro

Usage:
  kiro-flow init [options]             ruflo init → convert → MCP + steering + orchestrator
  kiro-flow convert agents [options]   convert .claude/agents personas to .kiro/agents
  kiro-flow doctor [options]           readiness checks (node, kiro-cli, MCP, agents)

Options (init):
  --dir <dir>         target workspace (default: cwd)
  --force             rerun ruflo init over an initialized workspace
  --skip-ruflo-init   only the Kiro-side steps (convert, mcp.json, steering, orchestrator)

Options (convert agents):
  --source <dir>      persona dir (default: .claude/agents)
  --out <dir>         output dir (default: .kiro/agents)
  --inline-prompts    embed prompt text in agent JSON instead of file://
  --no-hooks          skip the kf hook block (adapter → ruflo hook handlers)
  --dry-run           report only, write nothing
  --profiles <file>   tool-profiles.json override
  --tools-data <file> claude-flow tool-name list override

Options (doctor):
  --dir <dir>         workspace to check (default: cwd)
  --no-mcp            skip the live MCP handshake (slow on cold npx cache)
  --json              machine-readable output
`;

const [cmd, sub, ...rest] = process.argv.slice(2);

if (cmd === 'convert' && sub === 'agents') {
  const { values } = parseArgs({
    args: rest,
    options: {
      source: { type: 'string', default: '.claude/agents' },
      out: { type: 'string', default: '.kiro/agents' },
      'inline-prompts': { type: 'boolean', default: false },
      hooks: { type: 'boolean', default: true },
      'dry-run': { type: 'boolean', default: false },
      profiles: { type: 'string' },
      'tools-data': { type: 'string' },
    },
    allowNegative: true,
  });
  const { report } = convertAgents({
    source: resolve(values.source),
    out: resolve(values.out),
    inlinePrompts: values['inline-prompts'],
    hooks: values.hooks,
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
} else if (cmd === 'init') {
  const { values } = parseArgs({
    args: [sub, ...rest].filter((a) => a !== undefined),
    options: {
      dir: { type: 'string', default: '.' },
      force: { type: 'boolean', default: false },
      'skip-ruflo-init': { type: 'boolean', default: false },
    },
  });
  const dir = resolve(values.dir);
  console.log(`kiro-flow init → ${dir}\n`);
  const { steps } = initWorkspace({ dir, force: values.force, skipRufloInit: values['skip-ruflo-init'] });
  for (const s of steps) console.log(`  ${s.status === 'skipped' ? '·' : '✓'} ${s.step}: ${s.detail ?? s.status}`);
  console.log('\nNext: kiro-flow doctor   (checks kiro-cli, MCP handshake, agents)');
} else if (cmd === 'doctor') {
  const { values } = parseArgs({
    args: [sub, ...rest].filter((a) => a !== undefined),
    options: {
      dir: { type: 'string', default: '.' },
      mcp: { type: 'boolean', default: true },
      json: { type: 'boolean', default: false },
    },
    allowNegative: true,
  });
  const { checks, failed } = await runDoctor({ dir: resolve(values.dir), checkMcp: values.mcp });
  console.log(values.json ? JSON.stringify({ checks, failed }, null, 2) : formatDoctorReport(checks));
  process.exit(failed ? 1 : 0);
} else if (cmd === '--help' || cmd === '-h' || cmd === undefined || cmd === 'help') {
  console.log(USAGE);
} else {
  console.error(`unknown command: ${[cmd, sub].filter(Boolean).join(' ')}\n\n${USAGE}`);
  process.exit(1);
}
