---
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
- Swarm session: `kiro-flow hive-mind spawn -o "<objective>"` (queen-led)
- Background workers: `kiro-flow daemon start`
- Cited research: chat with **kf-deep-researcher**
- Any of ruflo's 166 command prompts: `kiro-flow cmd --list`

Everything coordinates through the `claude-flow` MCP server (this Power's
mcp.json) and persists to workspace memory (`.swarm/`, `.claude-flow/`).
Decisions stored in one session are recalled automatically in the next.

## Full install

This Power carries the flagship agents only. For the full library (70+
agents, hooks, shim, learning loop):

```
curl -fsSL https://cdn.jsdelivr.net/gh/smashkat12/kiro-flow@main/scripts/install.sh | bash
```
