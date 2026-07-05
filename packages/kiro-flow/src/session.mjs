/**
 * kiro-flow session/memory commands — the M7 persistence surface.
 *
 *   kiro-flow session list          join Kiro's per-directory chat sessions
 *                                   with the hook-recorded bridge data
 *   kiro-flow session resume <id>   kiro-cli chat --resume-id <id>
 *   kiro-flow memory refresh        synchronous recall-cache rebuild
 *                                   (hooks refresh it detached; this is the
 *                                   deterministic manual/CI variant)
 *
 * The bridge file (.claude-flow/kiro-flow/kiro-sessions.json) and recall
 * cache (.claude-flow/kiro-flow/recall-cache.json) are written by the hook
 * adapter's session-bridge / memory-refresh builtins — paths must stay in
 * sync with templates/kiro-hook-adapter.cjs.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUFLO_SPEC } from './init.mjs';

export const RECALL_CACHE_REL = join('.claude-flow', 'kiro-flow', 'recall-cache.json');
export const SESSIONS_BRIDGE_REL = join('.claude-flow', 'kiro-flow', 'kiro-sessions.json');

/** Bridge records keyed by Kiro session id (hook-recorded). */
export function readBridge(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, SESSIONS_BRIDGE_REL), 'utf8')).sessions ?? {};
  } catch {
    return {};
  }
}

/** Kiro's own saved chat sessions for this directory (empty if kiro-cli absent). */
export function readKiroSessions(dir) {
  try {
    const out = execFileSync('kiro-cli', ['chat', '--list-sessions', '--format', 'json'], {
      cwd: dir, encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : parsed.sessions ?? [];
  } catch {
    return [];
  }
}

/** Join Kiro sessions with bridge records; bridge-only ids are kept (marker rows). */
export function joinSessions(kiroSessions, bridge) {
  const rows = [];
  const seen = new Set();
  for (const ks of kiroSessions) {
    const id = ks.session_id ?? ks.id ?? ks.sessionId ?? '';
    if (!id) continue;
    seen.add(id);
    const b = bridge[id];
    rows.push({
      id,
      updated: ks.updated_at ?? ks.updatedAt ?? b?.lastSeen ?? '',
      prompt: b?.promptHead ?? ks.first_message ?? ks.summary ?? '',
      lastResponse: b?.lastResponseHead ?? '',
      hooked: Boolean(b),
    });
  }
  for (const [id, b] of Object.entries(bridge)) {
    if (!seen.has(id)) {
      rows.push({ id, updated: b.lastSeen ?? '', prompt: b.promptHead ?? '', lastResponse: b.lastResponseHead ?? '', hooked: true });
    }
  }
  return rows.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

export function sessionListCommand({ dir }) {
  const rows = joinSessions(readKiroSessions(dir), readBridge(dir));
  if (!rows.length) {
    console.log('no sessions found (bridge records appear after the first hooked kf-* chat)');
    return 0;
  }
  for (const r of rows) {
    const flag = r.hooked ? '●' : '○';
    console.log(`${flag} ${r.id}  ${r.updated}`);
    if (r.prompt) console.log(`    prompt: ${r.prompt}`);
    if (r.lastResponse) console.log(`    last:   ${r.lastResponse}`);
  }
  console.log('\n● = ruflo hooks were active   resume: kiro-flow session resume <id>');
  return 0;
}

export function sessionResumeCommand({ dir, id, agent }) {
  if (!id) {
    console.error('usage: kiro-flow session resume <kiro-session-id> [--agent kf-…]');
    return 1;
  }
  const args = ['chat', '--resume-id', id, '--trust-all-tools'];
  if (agent) args.push('--agent', agent);
  const res = spawnSync('kiro-cli', args, { cwd: dir, stdio: 'inherit' });
  if (res.error) {
    console.error(`kiro-flow: failed to launch kiro-cli: ${res.error.message}`);
    return 127;
  }
  return res.status ?? 1;
}

/** Deterministic (blocking) recall-cache rebuild via `ruflo memory export`. */
export function memoryRefreshCommand({ dir }) {
  const cache = join(dir, RECALL_CACHE_REL);
  const res = spawnSync('npx', ['-y', RUFLO_SPEC, 'memory', 'export', '-o', cache, '-f', 'json'], {
    cwd: dir, stdio: ['ignore', 'inherit', 'inherit'], timeout: 300_000,
  });
  if (res.status === 0 && existsSync(cache)) {
    const { count } = JSON.parse(readFileSync(cache, 'utf8'));
    console.log(`recall cache refreshed: ${count} entries → ${cache}`);
    return 0;
  }
  console.error('recall cache refresh failed');
  return res.status ?? 1;
}
