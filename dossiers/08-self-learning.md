# 08 — Self-learning / ReasoningBank

**Status:** verified live (kiro-cli 2.10.0, 2026-07-05). The plan's loop —
*fail → consolidate → distilled memo visibly injected → retry* — ran end to
end on Kiro, and the judge plane works through the M5 shim.

## What the learning system actually is (honest assessment)

Reading the pinned 3.23 source separates three layers with very different
reality levels:

**1. The helpers loop — simple, real, and it ships.** `.claude/helpers/
intelligence.cjs` (installed by `ruflo init`, driven entirely by hooks):

- `post-edit` / `post-task` record outcomes to `pending-insights.jsonl` —
  including **failures** (ADR-174: `tool_response.success===false` → negative
  example; our adapter's `exit_code` normalization feeds this correctly).
- `session-end` → `consolidate()`: distills insights (e.g. a file edited 3+
  times becomes a "hot path" memo), dedupes the store, applies confidence
  decay, rebuilds the memory graph and **recomputes PageRank** →
  `ranked-context.json`.
- `route` (every prompt) → `getContext(prompt)`: trigram-Jaccard content
  match blended with PageRank (α=0.6), top-5 above threshold, printed →
  **injected into Kiro context** via the M4 stdout channel. Patterns that get
  matched are confidence-boosted next session (`feedback()` on post-task
  decays them on failure) — a small bandit-style update, not RL, but a real
  closed loop.

**2. The fable judge — real code, dormant wiring.** `fable-harness.ts` (batch
LLM judge/reflect with budget caps) is only called by `distill-oracle.ts`
(Tier 2 of a `resolved`-labeling oracle for weight-EFT SFT data), which has
**no callers in the shipped command surface** — opt-in plumbing, off by
default, spends nothing unless explicitly budgeted. It matters anyway: any
future upstream wiring (metaharness `learn`, distill flows) now works on Kiro
because the shim owns its exact spawn shape.

**3. The branding layer.** "SONA sub-0.05ms", "MoE routing", "HNSW 150×
faster" (the `hooks intelligence` CLI banner) are RuVector features that are
not what the shipping ambient loop runs on — the loop above is lexical
trigrams + PageRank + confidence arithmetic. Upstream's own v3 docs walk the
HNSW claim back to a **measured 1.9–4.7×** above the index crossover, and
label Flash-Attention numbers unverified. Set expectations accordingly:
the ambient learning is useful and real, the neural vocabulary around it is
mostly aspirational.

## What M8 adds on Kiro

### kf-judge (global agent) + shim routing

Judge calls run in an **empty temp cwd** (`mkdtemp ruflo-fable-`), where
workspace agents are invisible — so `kiro-flow init` installs `kf-judge` to
**`~/.kiro/agents/`** (global): a tool-free, `includeMcpJson:false`, strict
evaluator pinned to `claude-sonnet-4.5`.

The shim recognizes judge calls by the env marker upstream already sets
(`CLAUDE_ENTRYPOINT=fable-judge`, fable-harness.ts:176) and routes them
`--agent kf-judge --effort low`. `KIRO_FLOW_JUDGE_AGENT` overrides the agent
(empty string opts out); `KIRO_FLOW_SHIM_EFFORT` overrides effort. Worker
calls (`CLAUDE_ENTRYPOINT=worker`) are untouched.

### Guidance injection

Already wired since M4 (`userPromptSubmit → route`); M8 verified the full
chain live rather than adding new plumbing.

## Verification

Automated (`npm test`, 65 pass): judge-routing argv (fable shape → kf-judge
at low effort; opt-out; override; worker untouched) plus the existing shim
envelope tests the judge path rides on.

Live:

- **Judge**: exact fable argv from an empty tmpdir with
  `CLAUDE_ENTRYPOINT=fable-judge` → kf-judge returned a clean verdict array
  (resolved:true for a verified trajectory, resolved:false with "only
  speculated without verification" for the unverified one — conservative as
  instructed), inside the JSON envelope `extractVerdictArray` parses.
  0.03 credits.
- **The loop**: three failing `fs_write` payloads (verbatim Kiro hook shapes)
  → `[LEARN] Edit FAILURE recorded` ×3 → stop/session-end →
  `[INTELLIGENCE] Consolidated: 9 entries, 13 edges, 1 new, PageRank
  recomputed` → `ranked-context.json` contains the distilled memo
  ("Frequently edited: refund-handler.ts (3×) … hot path worth monitoring")
  → a **fresh live session** asked about retrying that file quoted the
  injected guidance verbatim — including its ranked similarity score —
  without using any tools.

## Work-side checklist (Kiro laptop)

- [ ] `~/.kiro/agents` is writable / not policy-managed (kf-judge install).
- [ ] One judge smoke call (the tmpdir invocation above) under the employer
      account — confirms model access for `claude-sonnet-4.5` and that
      global agents resolve from arbitrary cwds.
- [ ] Confirm the injected `[INTELLIGENCE]` block appears in the IDE plane,
      not just the CLI.
