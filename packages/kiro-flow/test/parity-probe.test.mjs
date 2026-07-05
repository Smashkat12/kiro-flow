/**
 * Parity-hardening probe — unit coverage for the classifier + arg builder that
 * scripts/mcp-parity-probe.mjs uses to live-drive the asserted MCP subsystems
 * (browser, metaharness, daa, aidefence, metrics, workflow, federation).
 *
 * The live run (against `npx ruflo mcp start`) is intentionally NOT in the
 * default suite — live MCP contention hangs `node --test test/`. Run it by hand:
 *   node scripts/mcp-parity-probe.mjs            (all 7 subsystems, exit 0/1)
 * These tests lock down the pure logic that decides real vs wired vs stub.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, argsFor, unwrapContent, PLAN, OVERRIDES } from '../../../scripts/mcp-parity-probe.mjs';

// ruflo often double-wraps: content[0].text is JSON whose .content[0].text is JSON.
const wrap = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] });
const doubleWrap = (obj) => ({ content: [{ type: 'text', text: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(obj) }] }) }] });

test('unwrapContent: peels single and double encoding to the real payload', () => {
  assert.deepEqual(unwrapContent(wrap({ hasPII: true })), { hasPII: true });
  assert.deepEqual(unwrapContent(doubleWrap({ safe: false })), { safe: false });
});

test('classify: real structured payload → real', () => {
  assert.equal(classify(wrap({ hasPII: true })).kind, 'real');
  assert.equal(classify(doubleWrap({ workflowId: 'wf-1', name: 'x' })).kind, 'real');
  assert.equal(classify(wrap({ snapshot: '- document' })).kind, 'real');
});

test('classify: embedded domain error / success:false / isError → wired (real handler)', () => {
  // the exact shape a wrong-arg aidefence call returns
  assert.equal(classify(doubleWrap({ error: 'input must be a string' })).kind, 'wired');
  assert.equal(classify(wrap({ success: false, reason: 'nope' })).kind, 'wired');
  assert.equal(classify({ isError: true, content: [{ type: 'text', text: 'boom' }] }).kind, 'wired');
  // federation's graceful degradation still proves wiring
  assert.equal(classify(wrap({ success: true, degraded: true, reason: 'agentbbs-not-found' })).kind, 'real');
});

test('classify: empty / null / not-implemented → stub', () => {
  assert.equal(classify(wrap({})).kind, 'stub');
  assert.equal(classify(wrap([])).kind, 'stub');
  assert.equal(classify({ content: [] }).kind, 'stub');
  assert.equal(classify(wrap({ message: 'not implemented' })).kind, 'stub');
  assert.equal(classify(null).kind, 'stub');
});

test('argsFor: fills required from schema + applies meaningful overrides', () => {
  // override wins even when the schema does not list the property
  const pii = argsFor({ name: 'aidefence_has_pii', inputSchema: { required: ['input'], properties: { input: { type: 'string' } } } });
  assert.equal(pii.input, OVERRIDES.aidefence_has_pii.input);

  // required scalar with no override → typed default
  const daa = argsFor({ name: 'daa_agent_create', inputSchema: { required: ['id'], properties: { id: { type: 'string' } } } });
  assert.equal(daa.id, OVERRIDES.daa_agent_create.id);

  // typed defaults for a tool with no override
  const misc = argsFor({ name: 'x_tool', inputSchema: { required: ['n', 'flag', 'list'], properties: { n: { type: 'number' }, flag: { type: 'boolean' }, list: { type: 'array' } } } });
  assert.equal(misc.n, 1);
  assert.equal(misc.flag, true);
  assert.deepEqual(misc.list, []);
});

test('PLAN covers all 7 asserted subsystems', () => {
  assert.deepEqual(
    Object.keys(PLAN).sort(),
    ['aidefence', 'browser', 'daa', 'federation', 'metaharness', 'metrics', 'workflow'],
  );
  for (const tools of Object.values(PLAN)) assert.ok(tools.length >= 1);
});
