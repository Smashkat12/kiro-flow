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
import { daemonCommand, workerCommand, runRuflo, resolveShimDir } from '../src/daemon.mjs';
import { hiveSpawnCommand } from '../src/hive.mjs';
import { sessionListCommand, sessionResumeCommand, memoryRefreshCommand } from '../src/session.mjs';

const USAGE = `kiro-flow — ruflo on AWS Kiro

Usage:
  kiro-flow init [options]             ruflo init → convert → MCP + steering + orchestrator
  kiro-flow convert agents [options]   convert .claude/agents personas to .kiro/agents
  kiro-flow doctor [options]           readiness checks (node, kiro-cli, MCP, agents)
  kiro-flow daemon <sub> [args...]     ruflo daemon with the kiro-claude-shim on PATH
  kiro-flow worker <args...>           ruflo hooks worker … with the shim on PATH
  kiro-flow swarm <args...>            ruflo swarm … (coordination; execution = queen/daemon)
  kiro-flow hive-mind spawn [args...]  hive prompt via ruflo, then kiro-cli chat --agent kf-queen
  kiro-flow hive-mind <sub> [args...]  other hive subcommands pass through to ruflo
  kiro-flow session list               Kiro chat sessions joined with hook bridge records
  kiro-flow session resume <id>        kiro-cli chat --resume-id <id> [--agent kf-…]
  kiro-flow memory refresh             rebuild the recall cache now (hooks do it detached)
  kiro-flow shim-path                  print the shim dir (for manual PATH injection)

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

Options (daemon/worker):
  --dir <dir>         workspace (default: cwd)
  --executor <x>      kiro | claude | mock (default: kiro)
                      kiro = workers run via kiro-cli through the shim;
                      claude = native Claude Code; mock = deterministic, no LLM
  (remaining args pass through to ruflo daemon / ruflo hooks worker)
`;

/** Split our wrapper flags from args destined for the wrapped ruflo command. */
function splitPassthrough(argv) {
  const ours = { dir: '.', executor: 'kiro' };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') ours.dir = argv[++i];
    else if (argv[i] === '--executor') ours.executor = argv[++i];
    else rest.push(argv[i]);
  }
  return { ...ours, rest };
}

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
} else if (cmd === 'daemon') {
  if (!sub) {
    console.error(`usage: kiro-flow daemon <start|stop|status|trigger|enable> [args...]`);
    process.exit(1);
  }
  const { dir, executor, rest: pass } = splitPassthrough(rest);
  process.exit(daemonCommand({ dir: resolve(dir), executor, sub, rest: pass }));
} else if (cmd === 'worker') {
  const { dir, executor, rest: pass } = splitPassthrough([sub, ...rest].filter((a) => a !== undefined));
  process.exit(workerCommand({ dir: resolve(dir), executor, rest: pass }));
} else if (cmd === 'swarm') {
  const { dir, executor, rest: pass } = splitPassthrough([sub, ...rest].filter((a) => a !== undefined));
  const code = runRuflo({ dir: resolve(dir), executor, args: ['swarm', ...pass] });
  if (pass[0] === 'start' || pass[0] === 'init') {
    console.log('\nkiro-flow: swarm state is coordination-only. Execute via:');
    console.log('  kiro-flow hive-mind spawn -o "<objective>"     (interactive queen session)');
    console.log('  kiro-cli chat --agent kf-orchestrator          (interactive fan-out)');
    console.log('  kiro-flow daemon start                         (background workers)');
  }
  process.exit(code);
} else if (cmd === 'hive-mind') {
  const { dir, executor, rest: pass } = splitPassthrough(rest);
  if (sub === 'spawn') {
    const noInteractive = pass.includes('--no-interactive');
    const upstream = pass.filter((a) => a !== '--no-interactive');
    process.exit(hiveSpawnCommand({ dir: resolve(dir), executor, rest: upstream, noInteractive }));
  }
  if (!sub) {
    console.error('usage: kiro-flow hive-mind <spawn|init|status|task|consensus|...> [args...]');
    process.exit(1);
  }
  process.exit(runRuflo({ dir: resolve(dir), executor, args: ['hive-mind', sub, ...pass] }));
} else if (cmd === 'session') {
  const { dir, rest: pass } = splitPassthrough(rest);
  if (sub === 'list') process.exit(sessionListCommand({ dir: resolve(dir) }));
  if (sub === 'resume') {
    const agentIdx = pass.indexOf('--agent');
    const agent = agentIdx >= 0 ? pass[agentIdx + 1] : undefined;
    const id = pass.filter((a, i) => a !== '--agent' && i !== agentIdx + 1)[0];
    process.exit(sessionResumeCommand({ dir: resolve(dir), id, agent }));
  }
  console.error('usage: kiro-flow session <list|resume <id>> [--dir <dir>] [--agent kf-…]');
  process.exit(1);
} else if (cmd === 'memory' && sub === 'refresh') {
  const { dir } = splitPassthrough(rest);
  process.exit(memoryRefreshCommand({ dir: resolve(dir) }));
} else if (cmd === 'shim-path') {
  console.log(resolveShimDir(resolve(sub === '--dir' ? rest[0] ?? '.' : '.')));
} else if (cmd === '--help' || cmd === '-h' || cmd === undefined || cmd === 'help') {
  console.log(USAGE);
} else {
  console.error(`unknown command: ${[cmd, sub].filter(Boolean).join(' ')}\n\n${USAGE}`);
  process.exit(1);
}
