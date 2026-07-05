/** clean-cc: removes inert Claude-Code files, keeps load-bearing ones. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanClaudeCode, INERT_CC_FILES, initWorkspace } from '../src/init.mjs';

function seed(dir) {
  mkdirSync(join(dir, '.claude', 'helpers'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'commands'), { recursive: true });
  mkdirSync(join(dir, '.claude-flow', 'data'), { recursive: true });
  // inert (should be removed)
  writeFileSync(join(dir, 'CLAUDE.md'), '# cc');
  writeFileSync(join(dir, '.mcp.json'), '{}');
  writeFileSync(join(dir, '.claude', 'settings.json'), '{}');
  // load-bearing (must survive)
  writeFileSync(join(dir, '.claude', 'helpers', 'hook-handler.cjs'), '// kernel');
  writeFileSync(join(dir, '.claude', 'commands', 'x.md'), 'cmd');
  writeFileSync(join(dir, '.claude-flow', 'data', 'graph-state.json'), '{}');
}

test('cleanClaudeCode: removes only the inert files, keeps the kernel/commands/engine', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kf-cc-'));
  try {
    seed(dir);
    const removed = cleanClaudeCode(dir);
    assert.deepEqual(removed.sort(), ['.mcp.json', join('.claude', 'settings.json'), 'CLAUDE.md'].sort());

    for (const f of ['CLAUDE.md', '.mcp.json', join('.claude', 'settings.json')]) {
      assert.ok(!existsSync(join(dir, f)), `${f} should be gone`);
    }
    for (const f of [join('.claude', 'helpers', 'hook-handler.cjs'), join('.claude', 'commands', 'x.md'), join('.claude-flow', 'data', 'graph-state.json')]) {
      assert.ok(existsSync(join(dir, f)), `${f} must survive`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cleanClaudeCode: idempotent, no-op on an already-clean tree', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kf-cc2-'));
  try {
    assert.deepEqual(cleanClaudeCode(dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('INERT_CC_FILES never lists a load-bearing path', () => {
  for (const f of INERT_CC_FILES) {
    assert.ok(!f.includes('helpers'), 'helpers is load-bearing');
    assert.ok(!f.includes('commands'), 'commands is load-bearing');
    assert.ok(!f.startsWith('.claude-flow'), '.claude-flow is ruflo engine state');
  }
});

test('init: clean step runs by default, --keep-cc (cleanCc:false) skips it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kf-cc3-'));
  try {
    mkdirSync(join(dir, '.claude', 'agents', 'core'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'agents', 'core', 'coder.md'),
      '---\nname: coder\ndescription: writes code\n---\n\nYou are a coder.\n');
    writeFileSync(join(dir, 'CLAUDE.md'), '# cc');

    const kept = initWorkspace({ dir, skipRufloInit: true, cleanCc: false });
    assert.equal(kept.steps.find((s) => s.step === 'clean Claude-Code files').status, 'skipped');
    assert.ok(existsSync(join(dir, 'CLAUDE.md')), 'CLAUDE.md kept with --keep-cc');

    const cleaned = initWorkspace({ dir, skipRufloInit: true });
    assert.equal(cleaned.steps.find((s) => s.step === 'clean Claude-Code files').status, 'done');
    assert.ok(!existsSync(join(dir, 'CLAUDE.md')), 'CLAUDE.md removed by default');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
