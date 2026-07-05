# Dossier 01 (generated) — ruflo MCP tool inventory

*350 tools from `npx -y ruflo mcp start` tools/list, ruflo v3.23.0.*

## Categories (35)

| Category | Count |
|---|---|
| hooks | 44 |
| browser | 29 |
| wasm | 27 |
| agentdb | 20 |
| memory | 15 |
| metaharness | 15 |
| workflow | 12 |
| claims | 12 |
| transfer | 11 |
| hive-mind | 10 |
| embeddings | 10 |
| ruvllm | 10 |
| autopilot | 10 |
| agenticow | 10 |
| agent | 9 |
| task | 9 |
| session | 8 |
| daa | 8 |
| coordination | 7 |
| config | 6 |
| analyze | 6 |
| aidefence | 6 |
| neural | 6 |
| performance | 6 |
| managed | 6 |
| system | 5 |
| terminal | 5 |
| github | 5 |
| guidance | 5 |
| swarm | 4 |
| progress | 4 |
| federation | 4 |
| mcp | 3 |
| business | 2 |
| http | 1 |


## hooks (44)

| Tool | Description |
|---|---|
| `hooks_build-agents` | Generate optimized agent configurations from pretrain data Use when native Bash hooks (via Claude Code's settings.json) are wrong because yo |
| `hooks_codemod` | Apply a deterministic, $0 (no-LLM) code transform — the real Tier-1 execution path (ADR-143). Supported intents: var-to-const, remove-consol |
| `hooks_coverage-gaps` | List all coverage gaps with priority scoring and agent assignments |
| `hooks_coverage-route` | Route task to agents based on test coverage gaps (ruvector integration) |
| `hooks_coverage-suggest` | Suggest coverage improvements for a path (ruvector integration) |
| `hooks_explain` | Explain routing decision with full transparency Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Rufl |
| `hooks_init` | Initialize hooks in project with .claude/settings.json Use when native Bash hooks (via Claude Code's settings.json) are wrong because you ne |
| `hooks_intelligence` | RuVector intelligence system status (shows REAL metrics from memory store) Use when native Bash hooks (via Claude Code's settings.json) are  |
| `hooks_intelligence_attention` | Compute attention-weighted similarity using MoE/Flash/Hyperbolic Use when native Bash hooks (via Claude Code's settings.json) are wrong beca |
| `hooks_intelligence_learn` | Force immediate SONA learning cycle with EWC++ consolidation Use when native Bash hooks (via Claude Code's settings.json) are wrong because  |
| `hooks_intelligence_pattern-search` | Search patterns using REAL vector search (HNSW when available, brute-force fallback) Use when native Bash hooks (via Claude Code's settings. |
| `hooks_intelligence_pattern-store` | Store pattern in ReasoningBank (HNSW-indexed) Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Ruflo- |
| `hooks_intelligence_stats` | Get RuVector intelligence layer statistics Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Ruflo-sid |
| `hooks_intelligence_trajectory-end` | End trajectory and trigger SONA learning with EWC++ Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need  |
| `hooks_intelligence_trajectory-start` | Begin SONA trajectory for reinforcement learning Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Ruf |
| `hooks_intelligence_trajectory-step` | Record step in trajectory for reinforcement learning Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need |
| `hooks_intelligence_unified-stats` | One honest view across the four learning stat sources: globalStats (`.claude-flow/neural/stats.json`), the in-memory SONA coordinator, memor |
| `hooks_intelligence-reset` | Reset intelligence learning state Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Ruflo-side state — |
| `hooks_list` | List all registered hooks Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Ruflo-side state — pattern |
| `hooks_metrics` | View learning metrics dashboard Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Ruflo-side state — p |
| `hooks_model-outcome` | Record model routing outcome for learning Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Ruflo-side |
| `hooks_model-route` | Route task to optimal Claude model (haiku/sonnet/opus) based on complexity Use when native Bash hooks (via Claude Code's settings.json) are  |
| `hooks_model-stats` | Get model routing statistics Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Ruflo-side state — patt |
| `hooks_model-verify` | Verify a generated output with CHEAP structural signals ($0, no LLM call) and get an escalation verdict — the post-generation half of confid |
| `hooks_notify` | Send cross-agent notification Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Ruflo-side state — pat |
| `hooks_post-command` | Record command execution outcome Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Ruflo-side state —  |
| `hooks_post-edit` | Record editing outcome for learning Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Ruflo-side state |
| `hooks_post-task` | Record task completion for learning Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Ruflo-side state |
| `hooks_pre-command` | Assess risk before executing a command Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Ruflo-side st |
| `hooks_pre-edit` | Get context and agent suggestions before editing a file Use when native Bash hooks (via Claude Code's settings.json) are wrong because you n |
| `hooks_pre-task` | Record task start and get agent suggestions with intelligent model routing (ADR-026) Use when native Bash hooks (via Claude Code's settings. |
| `hooks_pretrain` | Analyze repository to bootstrap intelligence (4-step pipeline) Use when native Bash hooks (via Claude Code's settings.json) are wrong becaus |
| `hooks_route` | Get a 3-tier routing recommendation for a task: Tier 1 (deterministic codemod, ~0ms / $0 — for var-to-const, remove-console, add-logging), T |
| `hooks_session-end` | End current session, stop daemon, and persist state Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need  |
| `hooks_session-restore` | Restore a previous session Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Ruflo-side state — patter |
| `hooks_session-start` | Initialize a new session and auto-start daemon Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Ruflo |
| `hooks_task-completed` | Agent Teams hook — fired when a task is marked complete. Records the completion and, when `trainPatterns:true`, feeds the outcome to the SON |
| `hooks_teammate-idle` | Agent Teams hook — fired when a teammate agent finishes its turn; reports whether a pending task can be auto-assigned. Use when native Task  |
| `hooks_transfer` | Transfer learned patterns from another project Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Ruflo |
| `hooks_worker-cancel` | Cancel a running worker Use when native Bash hooks (via Claude Code's settings.json) are wrong because you need Ruflo-side state — pattern p |
| `hooks_worker-detect` | Detect worker triggers from user prompt (for UserPromptSubmit hook) Use when native Bash hooks (via Claude Code's settings.json) are wrong b |
| `hooks_worker-dispatch` | Dispatch a background worker for analysis/optimization tasks Use when native Bash hooks (via Claude Code's settings.json) are wrong because  |
| `hooks_worker-list` | List all 12 background workers with status and capabilities Use when native Bash hooks (via Claude Code's settings.json) are wrong because y |
| `hooks_worker-status` | Get status of a specific worker or all active workers Use when native Bash hooks (via Claude Code's settings.json) are wrong because you nee |

## browser (29)

| Tool | Description |
|---|---|
| `browser_act` | Use when a target element is easier to describe than to select, or when an intent spans several steps: executes a natural-language instructi |
| `browser_back` | Navigate back in browser history Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login f |
| `browser_check` | Check a checkbox Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login flows with cookie |
| `browser_click` | Click an element using ref (@e1) or CSS selector Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA s |
| `browser_close` | Close the browser session Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login flows wi |
| `browser_cookie_use` | Fetch a vault handle for a host from the browser-cookies AgentDB namespace. Raw cookie values are NEVER returned — only the opaque handle pl |
| `browser_eval` | Execute JavaScript in page context Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login |
| `browser_fill` | Clear and fill an input element Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login fl |
| `browser_forward` | Navigate forward in browser history Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, logi |
| `browser_get-text` | Get text content of an element Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login flo |
| `browser_get-title` | Get the page title Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login flows with cook |
| `browser_get-url` | Get the current URL Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login flows with coo |
| `browser_get-value` | Get value of an input element Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login flow |
| `browser_hover` | Hover over an element using ref (@e1) or CSS selector Use when native WebFetch is wrong because you need real browser automation — JS-heavy  |
| `browser_open` | Navigate browser to a URL Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login flows wi |
| `browser_press` | Press a keyboard key Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login flows with co |
| `browser_reload` | Reload the current page Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login flows with |
| `browser_screenshot` | Capture screenshot of the page Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login flo |
| `browser_scroll` | Scroll the page Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login flows with cookie  |
| `browser_select` | Select an option from a dropdown Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login f |
| `browser_session_end` | End a recorded browser session: trajectory-end with verdict, rvf compact, AIDefence pre-store gate (best-effort), and AgentDB index in the b |
| `browser_session_record` | Open a named, traced browser session: allocate an RVF cognitive container, begin a ruvector trajectory, then open the URL via agent-browser. |
| `browser_session_replay` | Load a recorded session trajectory and return its steps so the caller can dispatch them through the 23 browser_* tools. Does NOT itself driv |
| `browser_session-list` | List active browser sessions Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login flows |
| `browser_snapshot` | Get AI-optimized accessibility tree snapshot with element refs (@e1, @e2, etc.) Use when native WebFetch is wrong because you need real brow |
| `browser_template_apply` | Fetch a recipe from the browser-templates AgentDB namespace and return it for caller-level execution. Use when native WebFetch is wrong beca |
| `browser_type` | Type text with key events (for autocomplete, etc.) Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA |
| `browser_uncheck` | Uncheck a checkbox Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login flows with cook |
| `browser_wait` | Wait for a condition Use when native WebFetch is wrong because you need real browser automation — JS-heavy SPA scraping, login flows with co |

## wasm (27)

| Tool | Description |
|---|---|
| `wasm_agent_compose` | Compose an RVF container with explicit skills, MCP tool descriptors, prompts, and tools. Returns base64-encoded RVF bytes + a manifest of wh |
| `wasm_agent_create` | Create a sandboxed WASM agent with virtual filesystem (no OS access). Optionally use a gallery template. Use when native Task is wrong becau |
| `wasm_agent_export` | Export a WASM agent's full state (config, filesystem, conversation) as JSON. Use when native Task is wrong because the workload needs sandbo |
| `wasm_agent_files` | Get a WASM agent's available tools and info. Use when native Task is wrong because the workload needs sandboxed isolation — untrusted code e |
| `wasm_agent_is_stopped` | Check whether a WASM agent has reached its stop condition (max turns or explicit stop). Use when native Task is wrong because the stop condi |
| `wasm_agent_list` | List all active WASM agents. Use when native Task is wrong because the workload needs sandboxed isolation — untrusted code execution, browse |
| `wasm_agent_prompt` | Send a prompt to a WASM agent and get a response. Use when native Task is wrong because the workload needs sandboxed isolation — untrusted c |
| `wasm_agent_reset` | Reset a WASM agent — clears messages and turn count so it can be reused across tasks. Use when native Task is wrong because the agent lives  |
| `wasm_agent_state` | Read the full internal state of a WASM agent (messages, turn count, config, stop status). Use when native Task is wrong because the agent ru |
| `wasm_agent_terminate` | Terminate a WASM agent and free resources. Use when native Task is wrong because the workload needs sandboxed isolation — untrusted code exe |
| `wasm_agent_todos` | Get the structured todo list of a WASM agent as JSON. Use when native Task is wrong because the todo state lives inside the sandboxed WASM r |
| `wasm_agent_tool` | Execute a tool on a WASM agent sandbox. Tools: read_file, write_file, edit_file, write_todos, list_files. Use flat format: {tool, path, cont |
| `wasm_agent_tools` | List the tools registered on a WASM agent sandbox. Use when native Task is wrong because the tool registry lives inside the WASM runtime and |
| `wasm_agent_turn_count` | Return the current turn count of a WASM agent. Use when native Task is wrong because turn-limit enforcement and progress tracking must be po |
| `wasm_gallery_active` | Return the ID of the currently active WASM gallery template. Use when native Bash is wrong because the active-template cursor is tracked ins |
| `wasm_gallery_add_custom` | Add a custom agent template to the WASM gallery registry. Use when native Write is wrong because custom templates must be registered inside  |
| `wasm_gallery_categories` | Return all WASM gallery template categories with per-category template counts. Use when native Bash/ls is wrong because gallery category met |
| `wasm_gallery_config` | Get the runtime configuration overrides applied to the active WASM gallery template. Use when native Read is wrong because gallery config ov |
| `wasm_gallery_configure` | Apply runtime configuration overrides (e.g. maxTurns, model) to the active WASM gallery template. Use when native Edit is wrong because gall |
| `wasm_gallery_create` | Create a WASM agent from a gallery template. Use when native Task is wrong because the workload needs sandboxed isolation — untrusted code e |
| `wasm_gallery_export` | Export all custom WASM gallery templates as a JSON snapshot. Use when native Read/cat is wrong because custom templates live inside the WASM |
| `wasm_gallery_import` | HIGH RISK: Import custom templates from JSON into the gallery. The payload is deserialized inside the WASM runtime — a malicious system_prom |
| `wasm_gallery_list` | List all available WASM agent gallery templates (Coder, Researcher, Tester, Reviewer, Security, Swarm). Use when native Task is wrong becaus |
| `wasm_gallery_list_by_category` | List WASM gallery templates filtered to a specific category. Use when native Glob is wrong because gallery templates are stored in the WASM  |
| `wasm_gallery_load_rvf` | Load a named gallery template as a base64-encoded RVF container. Use when native Read is wrong because RVF containers are packed inside the  |
| `wasm_gallery_remove_custom` | Remove a custom template from the WASM gallery by ID. Use when native Bash rm is wrong because custom templates exist only inside the WASM r |
| `wasm_gallery_search` | Search WASM agent gallery templates by query. Use when native Task is wrong because the workload needs sandboxed isolation — untrusted code  |

## agentdb (20)

| Tool | Description |
|---|---|
| `agentdb_batch` | Batch operations on AgentDB episodes (insert, update, delete). Note: entries are stored in the AgentDB episodes table, not the memory_search |
| `agentdb_causal-edge` | Record a causal edge between two memory entries via CausalMemoryGraph Use when generic memory_* tools are wrong because you need AgentDB-spe |
| `agentdb_causal-edge-delete` | Delete a causal edge between two memory entries. Returns controller="native-unsupported" when the edge lives in graph-node native storage (n |
| `agentdb_causal-node-delete` | Cascade-delete a causal node and all its incident edges from the SQL fallback. Native graph-node entries are unaffected (no delete API in th |
| `agentdb_consolidate` | Run memory consolidation to promote entries across tiers and compress old data Use when generic memory_* tools are wrong because you need Ag |
| `agentdb_context-synthesize` | Synthesize context from stored memories for a given query Use when generic memory_* tools are wrong because you need AgentDB-specific contro |
| `agentdb_controllers` | List all AgentDB v3 controllers and their initialization status Use when generic memory_* tools are wrong because you need AgentDB-specific  |
| `agentdb_feedback` | Record task feedback for learning via LearningSystem + ReasoningBank controllers Use when generic memory_* tools are wrong because you need  |
| `agentdb_graph-pathfinder` | Multi-algorithm native graph pathfinder (ADR-130 Phase 5). Use when agentdb_graph-query k-hop is not enough — pathfinder supports personaliz |
| `agentdb_graph-query` | Unified graph traversal across the knowledge graph (ADR-130). Dispatches to the most capable backend: graph-node native for k-hop, sql.js CT |
| `agentdb_health` | Get AgentDB v3 controller health status including cache stats and attestation count Use when generic memory_* tools are wrong because you ne |
| `agentdb_hierarchical-delete` | Delete a hierarchical-memory entry by key. Returns controller="native-unsupported" when the entry is in a backend without a public delete AP |
| `agentdb_hierarchical-recall` | Recall from hierarchical memory with optional tier filter Use when generic memory_* tools are wrong because you need AgentDB-specific contro |
| `agentdb_hierarchical-store` | Store to hierarchical memory with tier (working, episodic, semantic) Use when generic memory_* tools are wrong because you need AgentDB-spec |
| `agentdb_pattern-search` | Search patterns via ReasoningBank controller with BM25+semantic hybrid Use when generic memory_* tools are wrong because you need AgentDB-sp |
| `agentdb_pattern-store` | Store a pattern directly via ReasoningBank controller Use when generic memory_* tools are wrong because you need AgentDB-specific controller |
| `agentdb_route` | Route a task via AgentDB SemanticRouter or LearningSystem recommendAlgorithm Use when generic memory_* tools are wrong because you need Agen |
| `agentdb_semantic-route` | Route an input via AgentDB SemanticRouter for intent classification Use when generic memory_* tools are wrong because you need AgentDB-speci |
| `agentdb_session-end` | End session, persist to ReflexionMemory, trigger NightlyLearner consolidation Use when generic memory_* tools are wrong because you need Age |
| `agentdb_session-start` | Start a session with ReflexionMemory episodic replay Use when generic memory_* tools are wrong because you need AgentDB-specific controllers |

## memory (15)

| Tool | Description |
|---|---|
| `memory_bridge_status` | Show Claude Code memory bridge status — AgentDB vectors, SONA learning, intelligence patterns, and connection health. Use when native Read/W |
| `memory_cleanup` | Prune memory entries whose TTL has expired (dry run by default; pass dryRun:false to delete). Use when native rm is wrong because the entrie |
| `memory_compress` | Report memory-store size breakdown (the sql.js backend has no on-disk compression — entries are already stored compactly; quantized embeddin |
| `memory_delete` | Remove a stored memory entry by exact (namespace, key). Use when a previously stored decision is invalidated or contains stale data. No nati |
| `memory_detailed-stats` | Detailed memory-store report — backend, entry count, total bytes, per-namespace counts, and (placeholder) perf metrics. Use when native Read |
| `memory_export` | Export memory entries to a JSON file (keys, namespaces, timestamps, and values when available). Use when native Write is wrong because the d |
| `memory_import` | Import memory entries from a JSON export file (produced by memory_export) into .swarm/memory.db, re-embedding values. Use when native Read i |
| `memory_import_claude` | Import Claude Code auto-memory files into AgentDB with ONNX vector embeddings. Reads ~/.claude/projects/*/memory/*.md files, parses YAML fro |
| `memory_list` | Enumerate stored memory entries (optionally filtered by namespace/tags) without semantic search. Use when native Glob is wrong because the e |
| `memory_migrate` | Manually trigger migration from legacy JSON store to sql.js Use when native Read/Write is wrong because you need (a) cross-session retrieval |
| `memory_retrieve` | Read back a value previously stored via memory_store, by exact (namespace, key) — lossless, includes metadata. Use when native Read is wrong |
| `memory_search` | Find stored memories by meaning (vector similarity), not by literal text — finds "JWT auth pattern" when you query "token-based login flow". |
| `memory_search_unified` | Search across both Claude Code memories and AgentDB entries using semantic vector similarity. Returns merged, deduplicated results from all  |
| `memory_stats` | Get memory storage statistics including HNSW index status Use when native Read/Write is wrong because you need (a) cross-session retrieval b |
| `memory_store` | Persistent key-value store with vector embedding — survives across sessions and is searchable by meaning, not just by file path. Use when na |

## metaharness (15)

| Tool | Description |
|---|---|
| `metaharness_audit_list` | ADR-150 iter 16 — list timestamped records from the `metaharness-audit` memory namespace. Use when you need to discover which audit keys exi |
| `metaharness_audit_trend` | ADR-150 iter 15 — diff two oia-audit records (drift detection). Accepts EITHER memory keys (run metaharness_audit_list first to discover the |
| `metaharness_bench` | ADR-153 supporting verb — create or verify bench suites used by metaharness_evolve --bench. Bench suites are JSON files of {input, expectedO |
| `metaharness_drift_from_history` | iter 53 — one-command drift detection. Composes audit-list + oia-audit + audit-trend: finds the most recent record in `metaharness-audit` na |
| `metaharness_evolve` | ADR-153 — Darwin Mode: mutate one of seven harness policy surfaces (planner/contextBuilder/reviewer/retryPolicy/toolPolicy/memoryPolicy/scor |
| `metaharness_genome` | ADR-150 — 7-section categorical readiness report from `metaharness genome <path>` (repo_type / agent_topology / risk_score / mcp_surface / t |
| `metaharness_gepa` | GEPA genome operations from the `@metaharness/darwin/gepa` library entry (darwin 0.8.0). op=genome loads + validates a genome (default: the  |
| `metaharness_learn` | ADR-235 (upstream) — GEPA learning run via `metaharness learn`: optimizes a harness genome against a SWE-bench-style slice manifest. $0 DRY- |
| `metaharness_mcp_scan` | ADR-150 — static security scan of `.mcp/servers.json` + `.harness/claims.json` via `harness mcp-scan <path>`. Reads only; no dispatch. Use w |
| `metaharness_oia_audit` | ADR-150 — composite weekly audit. Bundles oia-manifest + threat-model + mcp-scan into one timestamped record persisted to `metaharness-audit |
| `metaharness_redblue` | Adversarial red/blue LLM testing via @metaharness/redblue — generates attacks across OWASP LLM Top-10 / NIST AI RMF families (prompt injecti |
| `metaharness_score` | ADR-150 — 5-dimension harness readiness scorecard from `metaharness score <path>` (harnessFit / compileConfidence / taskCoverage / toolSafet |
| `metaharness_security_bench` | ADR-153 — upstream Darwin Shield (their own ADR-155): evolves a champion security-detection harness against a 10-vuln/9-decoy ground-truth c |
| `metaharness_similarity` | ADR-152 §3.1 — weighted similarity between two harness fingerprints (genome + score JSON). Returns overall ∈ [0,1] plus per-component breakd |
| `metaharness_threat_model` | ADR-150 — enterprise-grade threat model from `harness threat-model <path>`. Returns worst-severity verdict (clean/low/medium/high) + categor |

## workflow (12)

| Tool | Description |
|---|---|
| `workflow_cancel` | Cancel a workflow Use when native TodoWrite + sequential Bash is wrong because the work has a real dependency graph that needs persistence,  |
| `workflow_create` | Create a new workflow Use when native TodoWrite + sequential Bash is wrong because the work has a real dependency graph that needs persisten |
| `workflow_delete` | Delete a workflow Use when native TodoWrite + sequential Bash is wrong because the work has a real dependency graph that needs persistence,  |
| `workflow_execute` | Execute a workflow Use when native TodoWrite + sequential Bash is wrong because the work has a real dependency graph that needs persistence, |
| `workflow_list` | List all workflows Use when native TodoWrite + sequential Bash is wrong because the work has a real dependency graph that needs persistence, |
| `workflow_pause` | Pause a running workflow Use when native TodoWrite + sequential Bash is wrong because the work has a real dependency graph that needs persis |
| `workflow_resume` | Resume a paused workflow Use when native TodoWrite + sequential Bash is wrong because the work has a real dependency graph that needs persis |
| `workflow_run` | Run a workflow from a template or file Use when native TodoWrite + sequential Bash is wrong because the work has a real dependency graph tha |
| `workflow_status` | Get workflow status Use when native TodoWrite + sequential Bash is wrong because the work has a real dependency graph that needs persistence |
| `workflow_stop` | Stop a running/paused workflow and skip its remaining steps. Use when native TodoWrite + sequential Bash is wrong because the work has a rea |
| `workflow_template` | Save workflow as template or create from template Use when native TodoWrite + sequential Bash is wrong because the work has a real dependenc |
| `workflow_validate` | Structurally validate a workflow definition file (JSON) — checks it has a steps/stages/tasks array and that each step names an agent. Use wh |

## claims (12)

| Tool | Description |
|---|---|
| `claims_accept-handoff` | Accept a pending handoff Use when nothing native covers per-agent capability gating — Claude Code agents have file-system access by default. |
| `claims_board` | Get a visual board view of all claims Use when nothing native covers per-agent capability gating — Claude Code agents have file-system acces |
| `claims_claim` | Claim an issue for work (human or agent) Use when nothing native covers per-agent capability gating — Claude Code agents have file-system ac |
| `claims_handoff` | Request handoff of an issue to another claimant Use when nothing native covers per-agent capability gating — Claude Code agents have file-sy |
| `claims_list` | List all claims or filter by criteria Use when nothing native covers per-agent capability gating — Claude Code agents have file-system acces |
| `claims_load` | Get agent load information Use when nothing native covers per-agent capability gating — Claude Code agents have file-system access by defaul |
| `claims_mark-stealable` | Mark an issue as stealable by other agents Use when nothing native covers per-agent capability gating — Claude Code agents have file-system  |
| `claims_rebalance` | Suggest or apply load rebalancing across agents Use when nothing native covers per-agent capability gating — Claude Code agents have file-sy |
| `claims_release` | Release a claim on an issue Use when nothing native covers per-agent capability gating — Claude Code agents have file-system access by defau |
| `claims_status` | Update claim status Use when nothing native covers per-agent capability gating — Claude Code agents have file-system access by default. Pair |
| `claims_steal` | Steal a stealable issue Use when nothing native covers per-agent capability gating — Claude Code agents have file-system access by default.  |
| `claims_stealable` | List all stealable issues Use when nothing native covers per-agent capability gating — Claude Code agents have file-system access by default |

## transfer (11)

| Tool | Description |
|---|---|
| `transfer_detect-pii` | Detect PII in content without redacting Use when native package install (`npm i`, `pip install`) is wrong because the artifact lives on IPFS |
| `transfer_ipfs-resolve` | Resolve IPNS name to CID Use when native package install (`npm i`, `pip install`) is wrong because the artifact lives on IPFS (plugins, witn |
| `transfer_plugin-featured` | Get featured plugins from the store Use when native package install (`npm i`, `pip install`) is wrong because the artifact lives on IPFS (pl |
| `transfer_plugin-info` | Get detailed info about a plugin Use when native package install (`npm i`, `pip install`) is wrong because the artifact lives on IPFS (plugi |
| `transfer_plugin-official` | Get official plugins from the store Use when native package install (`npm i`, `pip install`) is wrong because the artifact lives on IPFS (pl |
| `transfer_plugin-search` | Search the plugin store Use when native package install (`npm i`, `pip install`) is wrong because the artifact lives on IPFS (plugins, witne |
| `transfer_store-download` | Download a pattern from the store Use when native package install (`npm i`, `pip install`) is wrong because the artifact lives on IPFS (plug |
| `transfer_store-featured` | Get featured patterns from the store Use when native package install (`npm i`, `pip install`) is wrong because the artifact lives on IPFS (p |
| `transfer_store-info` | Get detailed info about a pattern Use when native package install (`npm i`, `pip install`) is wrong because the artifact lives on IPFS (plug |
| `transfer_store-search` | Search the pattern store Use when native package install (`npm i`, `pip install`) is wrong because the artifact lives on IPFS (plugins, witn |
| `transfer_store-trending` | Get trending patterns from the store Use when native package install (`npm i`, `pip install`) is wrong because the artifact lives on IPFS (p |

## hive-mind (10)

| Tool | Description |
|---|---|
| `hive-mind_broadcast` | Broadcast message to all workers Use when native Task is wrong because you need queen-led collective intelligence — Byzantine-FT consensus,  |
| `hive-mind_consensus` | Propose or vote on consensus with BFT, Raft, or Quorum strategies Use when native Task is wrong because you need queen-led collective intell |
| `hive-mind_init` | Initialize the hive-mind collective Use when native Task is wrong because you need queen-led collective intelligence — Byzantine-FT consensu |
| `hive-mind_join` | Join an agent to the hive-mind Use when native Task is wrong because you need queen-led collective intelligence — Byzantine-FT consensus, br |
| `hive-mind_leave` | Remove an agent from the hive-mind Use when native Task is wrong because you need queen-led collective intelligence — Byzantine-FT consensus |
| `hive-mind_memory` | Access hive shared memory Use when native Task is wrong because you need queen-led collective intelligence — Byzantine-FT consensus, broadca |
| `hive-mind_optimize-memory` | Compact the hive-mind shared-memory store (drops null/empty keys) and report before/after pattern counts. Use when native conversation memor |
| `hive-mind_shutdown` | Shutdown the hive-mind and terminate all workers Use when native Task is wrong because you need queen-led collective intelligence — Byzantin |
| `hive-mind_spawn` | Spawn workers and automatically join them to the hive-mind (combines agent/spawn + hive-mind/join) Use when native Task is wrong because you |
| `hive-mind_status` | Get hive-mind status Use when native Task is wrong because you need queen-led collective intelligence — Byzantine-FT consensus, broadcast ac |

## embeddings (10)

| Tool | Description |
|---|---|
| `embeddings_compare` | Compare similarity between two texts Use when text similarity matters beyond keyword match — native Grep finds exact strings, embeddings fin |
| `embeddings_generate` | Generate embeddings for text (Euclidean or hyperbolic) Use when text similarity matters beyond keyword match — native Grep finds exact strin |
| `embeddings_hyperbolic` | Hyperbolic embedding operations (Poincaré ball) Use when text similarity matters beyond keyword match — native Grep finds exact strings, emb |
| `embeddings_init` | Initialize the ONNX embedding subsystem with hyperbolic support Use when text similarity matters beyond keyword match — native Grep finds ex |
| `embeddings_neural` | Neural substrate operations (RuVector integration) Use when text similarity matters beyond keyword match — native Grep finds exact strings,  |
| `embeddings_rabitq_build` | Build RaBitQ 1-bit quantized index from stored embeddings (32× compression). Pre-filters candidates via Hamming scan before exact rerank. Us |
| `embeddings_rabitq_search` | Search via RaBitQ quantized index (fast Hamming scan). Returns candidate IDs for reranking. Use when text similarity matters beyond keyword  |
| `embeddings_rabitq_status` | Get RaBitQ quantized index status — availability, vector count, compression ratio Use when text similarity matters beyond keyword match — na |
| `embeddings_search` | Semantic search across stored embeddings Use when text similarity matters beyond keyword match — native Grep finds exact strings, embeddings |
| `embeddings_status` | Get embeddings system status and configuration Use when text similarity matters beyond keyword match — native Grep finds exact strings, embe |

## ruvllm (10)

| Tool | Description |
|---|---|
| `ruvllm_chat_format` | Format chat messages using a template (llama3, mistral, chatml, phi, gemma, or auto-detect). Use when sending every prompt to the Anthropic  |
| `ruvllm_generate_config` | Create a generation config (maxTokens, temperature, topP, etc.) as JSON. Use when sending every prompt to the Anthropic API is wrong because |
| `ruvllm_hnsw_add` | Add a pattern to an HNSW router. Embedding must match router dimensions. Use when sending every prompt to the Anthropic API is wrong because |
| `ruvllm_hnsw_create` | Create a WASM HNSW router for semantic pattern routing. Max ~11 patterns (v2.0.1 limit). Use when sending every prompt to the Anthropic API  |
| `ruvllm_hnsw_route` | Route a query embedding to nearest patterns in HNSW index. Use when sending every prompt to the Anthropic API is wrong because you need loca |
| `ruvllm_microlora_adapt` | Adapt MicroLoRA weights with quality feedback. Use when sending every prompt to the Anthropic API is wrong because you need local inference  |
| `ruvllm_microlora_create` | Create a MicroLoRA adapter (ultra-lightweight LoRA, ranks 1-4). Use when sending every prompt to the Anthropic API is wrong because you need |
| `ruvllm_sona_adapt` | Run SONA instant adaptation with a quality signal. Use when sending every prompt to the Anthropic API is wrong because you need local infere |
| `ruvllm_sona_create` | Create a SONA instant adaptation loop (<1ms adaptation cycles). Use when sending every prompt to the Anthropic API is wrong because you need |
| `ruvllm_status` | Get ruvllm-wasm availability and initialization status. Use when sending every prompt to the Anthropic API is wrong because you need local i |

## autopilot (10)

| Tool | Description |
|---|---|
| `autopilot_config` | Configure autopilot limits: max iterations (1-1000), timeout in minutes (1-1440), and task sources. Use when running long-horizon goals that |
| `autopilot_disable` | Disable autopilot. Agents will be allowed to stop even if tasks remain. Use when running long-horizon goals that should resume automatically |
| `autopilot_enable` | Enable autopilot persistent completion. Agents will be re-engaged when tasks remain incomplete. Use when running long-horizon goals that sho |
| `autopilot_history` | Search past completion episodes by keyword. Requires AgentDB. Use when running long-horizon goals that should resume automatically across se |
| `autopilot_learn` | Discover success patterns from past task completions. Requires AgentDB for full functionality. Use when running long-horizon goals that shou |
| `autopilot_log` | Retrieve the autopilot event log. Shows enable/disable events, re-engagements, completions. Use when running long-horizon goals that should  |
| `autopilot_predict` | Predict the optimal next action based on current state and learned patterns. Use when running long-horizon goals that should resume automati |
| `autopilot_progress` | Detailed task progress broken down by source (team-tasks, swarm-tasks, file-checklist). Use when running long-horizon goals that should resu |
| `autopilot_reset` | Reset autopilot iteration counter and restart the timer. Use when running long-horizon goals that should resume automatically across session |
| `autopilot_status` | Get autopilot state including enabled status, iteration count, task progress, and learning metrics. Use when running long-horizon goals that |

## agenticow (10)

| Tool | Description |
|---|---|
| `agenticow_branch` | agenticow@~0.2.3 — COW-fork a base .rvf memory file. Measured 162-byte branches regardless of base size (verified at N=1k/10k/50k). Use when |
| `agenticow_checkpoint` | agenticow — freeze a labelled restore point on an .rvf memory file. Subsequent edits stay in a fresh COW child; rollback returns here. Use w |
| `agenticow_diff` | agenticow — show what a branch changed relative to its lineage: {added, overridden, deleted} vector-id lists. Use when you are about to prom |
| `agenticow_ingest` | agenticow — write vectors (with optional text payloads) into an .rvf memory branch or base. Records: [{id?, vector, text?}] — id auto-assign |
| `agenticow_lineage` | agenticow — walk the COW chain of an .rvf memory file: an ordered list of nodes (role working\|checkpoint\|base, id, label, parent, createdAt, |
| `agenticow_promote` | agenticow — merge a branch's edits back into its base (or an explicit target) memory file. After promote, branch edits become part of base l |
| `agenticow_query` | agenticow — k-NN read across an .rvf memory branch's full COW lineage (parent ∪ edits, child wins), returning {id, distance, branch, text}.  |
| `agenticow_rollback` | agenticow — discard all edits since the most recent checkpoint on an .rvf memory file. Reuses a fresh COW child derived from the checkpoint. |
| `agenticow_speculate` | agenticow — speculative branch-and-promote for parallel A/B memory exploration. Forks a 162-byte COW branch per candidate off a shared base  |
| `agenticow_status` | agenticow — health/geometry of an .rvf memory file: {totalVectors, totalSegments, fileSize, currentEpoch, deadSpaceRatio, readOnly, chainDep |

## agent (9)

| Tool | Description |
|---|---|
| `agent_execute` | Run a task on a previously-spawned agent_spawn record via the Anthropic Messages API with that agent's configured model. Use when native Tas |
| `agent_health` | Compute an agent's rolling health score (0-1) from recent task success ratio + response-latency p50/p95 + error rate. Use when native Task t |
| `agent_list` | List every Ruflo-tracked agent in the registry with its type, model, status, and taskCount. Use when native Task tool is wrong because you n |
| `agent_logs` | Return recorded activity-log entries for a tracked agent (idle/running history, last task result). Use when native Task tool is wrong becaus |
| `agent_pool` | Manage a fixed-size warm pool of pre-spawned agents to skip cold-start cost on bursty workloads. Use when native Task is wrong because (a) y |
| `agent_spawn` | Spawn a Ruflo-tracked agent with cost attribution + memory persistence + swarm coordination. Use when native Task tool is wrong because you  |
| `agent_status` | Read the lifecycle state of a single tracked agent: idle/running/stopped, current taskCount, lastResult, model, health score. Use when nativ |
| `agent_terminate` | Remove a Ruflo-tracked agent from the registry and free its swarm slot. Use when you need to (a) clean up a spawned agent so its cost-tracki |
| `agent_update` | Mutate a tracked agent's config (model, instructions, status, health) without re-spawning. Use when native Task tool is wrong because the ag |

## task (9)

| Tool | Description |
|---|---|
| `task_assign` | Assign a task to one or more agents Use when native TodoWrite is wrong because you need cross-session task persistence, agent assignment, de |
| `task_cancel` | Cancel a task Use when native TodoWrite is wrong because you need cross-session task persistence, agent assignment, dependency tracking, or  |
| `task_complete` | Mark task as complete Use when native TodoWrite is wrong because you need cross-session task persistence, agent assignment, dependency track |
| `task_create` | Create a new task Use when native TodoWrite is wrong because you need cross-session task persistence, agent assignment, dependency tracking, |
| `task_list` | List all tasks Use when native TodoWrite is wrong because you need cross-session task persistence, agent assignment, dependency tracking, or |
| `task_retry` | Re-queue a failed/cancelled/completed task by cloning its spec into a fresh pending task (the original record is kept as history). Use when  |
| `task_status` | Get task status Use when native TodoWrite is wrong because you need cross-session task persistence, agent assignment, dependency tracking, o |
| `task_summary` | Get a summary of all tasks by status Use when native TodoWrite is wrong because you need cross-session task persistence, agent assignment, d |
| `task_update` | Update task status or progress Use when native TodoWrite is wrong because you need cross-session task persistence, agent assignment, depende |

## session (8)

| Tool | Description |
|---|---|
| `session_current` | Return the most-recently-saved session (id, name, stats) — the de-facto "current" one. Use when native conversation memory is wrong because  |
| `session_delete` | Delete a saved session Use when native conversation memory is wrong because you need durable cross-session state — restoring agent definitio |
| `session_export` | Export a saved session (agents, tasks, memory snapshot) to a JSON file and/or return the payload. Use when native Write is wrong because the |
| `session_import` | Import a session JSON file (produced by session_export) into the local session store and optionally activate it. Use when native Read is wro |
| `session_info` | Get detailed session information Use when native conversation memory is wrong because you need durable cross-session state — restoring agent |
| `session_list` | List saved sessions Use when native conversation memory is wrong because you need durable cross-session state — restoring agent definitions, |
| `session_restore` | Restore a saved session Use when native conversation memory is wrong because you need durable cross-session state — restoring agent definiti |
| `session_save` | Save current session state Use when native conversation memory is wrong because you need durable cross-session state — restoring agent defin |

## daa (8)

| Tool | Description |
|---|---|
| `daa_agent_adapt` | Trigger agent adaptation based on feedback Use when native Task is wrong because you need agents that adapt their cognitive pattern (converg |
| `daa_agent_create` | Create a decentralized autonomous agent Use when native Task is wrong because you need agents that adapt their cognitive pattern (convergent |
| `daa_cognitive_pattern` | Analyze or change cognitive patterns Use when native Task is wrong because you need agents that adapt their cognitive pattern (convergent /  |
| `daa_knowledge_share` | Share knowledge between agents Use when native Task is wrong because you need agents that adapt their cognitive pattern (convergent / diverg |
| `daa_learning_status` | Get learning status for DAA agents Use when native Task is wrong because you need agents that adapt their cognitive pattern (convergent / di |
| `daa_performance_metrics` | Get DAA performance metrics Use when native Task is wrong because you need agents that adapt their cognitive pattern (convergent / divergent |
| `daa_workflow_create` | Create an autonomous workflow Use when native Task is wrong because you need agents that adapt their cognitive pattern (convergent / diverge |
| `daa_workflow_execute` | Execute a DAA workflow Use when native Task is wrong because you need agents that adapt their cognitive pattern (convergent / divergent / la |

## coordination (7)

| Tool | Description |
|---|---|
| `coordination_consensus` | Manage consensus protocol with BFT, Raft, or Quorum strategies Use when native Task is wrong because the work crosses multiple agents that n |
| `coordination_load_balance` | Configure load balancing Use when native Task is wrong because the work crosses multiple agents that need to vote/sync/load-balance — TodoWr |
| `coordination_metrics` | Get coordination metrics Use when native Task is wrong because the work crosses multiple agents that need to vote/sync/load-balance — TodoWr |
| `coordination_node` | Manage coordination nodes Use when native Task is wrong because the work crosses multiple agents that need to vote/sync/load-balance — TodoW |
| `coordination_orchestrate` | Orchestrate multi-agent coordination Use when native Task is wrong because the work crosses multiple agents that need to vote/sync/load-bala |
| `coordination_sync` | Synchronize state across nodes Use when native Task is wrong because the work crosses multiple agents that need to vote/sync/load-balance —  |
| `coordination_topology` | Configure swarm topology Use when native Task is wrong because the work crosses multiple agents that need to vote/sync/load-balance — TodoWr |

## config (6)

| Tool | Description |
|---|---|
| `config_export` | Export configuration to JSON Use when native settings.json edits are wrong because the values need to be read by the Ruflo runtime (daemon,  |
| `config_get` | Get configuration value Use when native settings.json edits are wrong because the values need to be read by the Ruflo runtime (daemon, MCP s |
| `config_import` | Import configuration from JSON Use when native settings.json edits are wrong because the values need to be read by the Ruflo runtime (daemon |
| `config_list` | List configuration values Use when native settings.json edits are wrong because the values need to be read by the Ruflo runtime (daemon, MCP |
| `config_reset` | Reset configuration to defaults Use when native settings.json edits are wrong because the values need to be read by the Ruflo runtime (daemo |
| `config_set` | Set configuration value Use when native settings.json edits are wrong because the values need to be read by the Ruflo runtime (daemon, MCP s |

## analyze (6)

| Tool | Description |
|---|---|
| `analyze_diff` | Analyze git diff for change risk assessment and classification Use when native `git diff` / `grep` / static analysis is wrong because you wa |
| `analyze_diff-classify` | Classify git diff change type Use when native `git diff` / `grep` / static analysis is wrong because you want LLM-graded change classificati |
| `analyze_diff-reviewers` | Suggest reviewers for git diff changes Use when native `git diff` / `grep` / static analysis is wrong because you want LLM-graded change cla |
| `analyze_diff-risk` | Quick risk assessment for git diff Use when native `git diff` / `grep` / static analysis is wrong because you want LLM-graded change classif |
| `analyze_diff-stats` | Get quick statistics for git diff Use when native `git diff` / `grep` / static analysis is wrong because you want LLM-graded change classifi |
| `analyze_file-risk` | Assess risk for a specific file change Use when native `git diff` / `grep` / static analysis is wrong because you want LLM-graded change cla |

## aidefence (6)

| Tool | Description |
|---|---|
| `aidefence_analyze` | Deep analysis of input for specific threat types with similar pattern search and mitigation recommendations. Use when nothing native exists  |
| `aidefence_has_pii` | Check if input contains PII (emails, SSNs, API keys, passwords, etc.). Use when nothing native exists — Claude Code does not have a PII / pr |
| `aidefence_is_safe` | Quick boolean check if input is safe. Fastest option for simple validation. Use when nothing native exists — Claude Code does not have a PII |
| `aidefence_learn` | Record detection feedback for pattern learning. Improves future detection accuracy. Use when nothing native exists — Claude Code does not ha |
| `aidefence_scan` | Scan input text for AI manipulation threats (prompt injection, jailbreaks, PII). Returns threat assessment with <10ms latency. Use when noth |
| `aidefence_stats` | Get AIDefence detection and learning statistics. Use when nothing native exists — Claude Code does not have a PII / prompt-injection / adver |

## neural (6)

| Tool | Description |
|---|---|
| `neural_compress` | Compress neural model or embeddings Use when nothing native trains on your workflow — Claude Code has no learning loop. Use to train SONA/Mo |
| `neural_optimize` | Optimize neural model performance Use when nothing native trains on your workflow — Claude Code has no learning loop. Use to train SONA/MoE/ |
| `neural_patterns` | Get or manage neural patterns Use when nothing native trains on your workflow — Claude Code has no learning loop. Use to train SONA/MoE/EWC  |
| `neural_predict` | Make predictions using a neural model Use when nothing native trains on your workflow — Claude Code has no learning loop. Use to train SONA/ |
| `neural_status` | Get neural system status Use when nothing native trains on your workflow — Claude Code has no learning loop. Use to train SONA/MoE/EWC patte |
| `neural_train` | Train a neural model Use when nothing native trains on your workflow — Claude Code has no learning loop. Use to train SONA/MoE/EWC patterns  |

## performance (6)

| Tool | Description |
|---|---|
| `performance_benchmark` | Run performance benchmarks Use when native shell timing (`time`, `hyperfine`) is wrong because you want Ruflo-aware benchmarks — HNSW search |
| `performance_bottleneck` | Detect performance bottlenecks Use when native shell timing (`time`, `hyperfine`) is wrong because you want Ruflo-aware benchmarks — HNSW se |
| `performance_metrics` | Get detailed performance metrics Use when native shell timing (`time`, `hyperfine`) is wrong because you want Ruflo-aware benchmarks — HNSW  |
| `performance_optimize` | Apply performance optimizations Use when native shell timing (`time`, `hyperfine`) is wrong because you want Ruflo-aware benchmarks — HNSW s |
| `performance_profile` | Profile specific component or operation Use when native shell timing (`time`, `hyperfine`) is wrong because you want Ruflo-aware benchmarks  |
| `performance_report` | Generate performance report Use when native shell timing (`time`, `hyperfine`) is wrong because you want Ruflo-aware benchmarks — HNSW searc |

## managed (6)

| Tool | Description |
|---|---|
| `managed_agent_create` | Spin up an Anthropic-managed cloud agent (Agent + Environment + Session) — the CLOUD counterpart of wasm_agent_create. Use when wasm_agent_c |
| `managed_agent_events` | Fetch the full server-persisted event log of a managed cloud-agent session (user turns, agent thinking, tool_use, tool_result, status) — the |
| `managed_agent_list` | List managed cloud-agent sessions on this Anthropic org (id, status, title) — the CLOUD counterpart of wasm_agent_list. Use when native conv |
| `managed_agent_prompt` | Send a user turn to a managed cloud-agent session and wait for it to go idle, returning the assistant text + a tool-use trace — the CLOUD co |
| `managed_agent_status` | Get the lifecycle state of a managed cloud-agent session: idle/running/error, title, last error. Use when native conversation memory is wron |
| `managed_agent_terminate` | Delete a managed cloud-agent session (stops billing for it) — the CLOUD counterpart of wasm_agent_terminate. Use when native nothing applies |

## system (5)

| Tool | Description |
|---|---|
| `system_health` | Perform system health check Use when native Bash is wrong because you need Ruflo runtime metrics (HNSW index size, ReasoningBank state, swar |
| `system_info` | Get system information Use when native Bash is wrong because you need Ruflo runtime metrics (HNSW index size, ReasoningBank state, swarm hea |
| `system_metrics` | Get system metrics and performance data Use when native Bash is wrong because you need Ruflo runtime metrics (HNSW index size, ReasoningBank |
| `system_reset` | Reset system state Use when native Bash is wrong because you need Ruflo runtime metrics (HNSW index size, ReasoningBank state, swarm health, |
| `system_status` | Get overall system status Use when native Bash is wrong because you need Ruflo runtime metrics (HNSW index size, ReasoningBank state, swarm  |

## terminal (5)

| Tool | Description |
|---|---|
| `terminal_close` | Close a terminal session Use when native Bash is wrong because you need a persistent terminal session across turns/agents with output captur |
| `terminal_create` | Create a new terminal session Use when native Bash is wrong because you need a persistent terminal session across turns/agents with output c |
| `terminal_execute` | Execute a command in a terminal session Use when native Bash is wrong because you need a persistent terminal session across turns/agents wit |
| `terminal_history` | Get command history for a terminal session Use when native Bash is wrong because you need a persistent terminal session across turns/agents  |
| `terminal_list` | List all terminal sessions Use when native Bash is wrong because you need a persistent terminal session across turns/agents with output capt |

## github (5)

| Tool | Description |
|---|---|
| `github_issue_track` | Track and manage issues Use when native Bash / file tools are wrong because this MCP tool exposes Ruflo-specific state or controllers that h |
| `github_metrics` | Get repository metrics and statistics Use when native Bash / file tools are wrong because this MCP tool exposes Ruflo-specific state or cont |
| `github_pr_manage` | Manage pull requests Use when native Bash / file tools are wrong because this MCP tool exposes Ruflo-specific state or controllers that have |
| `github_repo_analyze` | Analyze a GitHub repository Use when native Bash / file tools are wrong because this MCP tool exposes Ruflo-specific state or controllers th |
| `github_workflow` | Manage GitHub Actions workflows Use when native Bash / file tools are wrong because this MCP tool exposes Ruflo-specific state or controller |

## guidance (5)

| Tool | Description |
|---|---|
| `guidance_capabilities` | List all capability areas with their tools, commands, agents, and skills. Use this to discover what Ruflo can do. Use when generic "what too |
| `guidance_discover` | Discover all available agents and skills from the .claude/ directory. Returns live filesystem data. Use when generic "what tool should I use |
| `guidance_quickref` | Quick reference card for common operations. Returns the most useful commands for a given domain. Use when generic "what tool should I use?"  |
| `guidance_recommend` | Given a task description, recommend which capability areas, tools, agents, and workflow to use. Use when generic "what tool should I use?" g |
| `guidance_workflow` | Get a recommended workflow template for a task type. Includes steps, agents, and topology. Use when generic "what tool should I use?" guessi |

## swarm (4)

| Tool | Description |
|---|---|
| `swarm_health` | Check swarm health status with real state inspection Use when native Task tool is wrong because you need multi-agent coordination — topology |
| `swarm_init` | Initialize a swarm with persistent state tracking Use when native Task tool is wrong because you need multi-agent coordination — topology (h |
| `swarm_shutdown` | Shutdown a swarm and update persistent state Use when native Task tool is wrong because you need multi-agent coordination — topology (hierar |
| `swarm_status` | Get swarm status from persistent state Use when native Task tool is wrong because you need multi-agent coordination — topology (hierarchical |

## progress (4)

| Tool | Description |
|---|---|
| `progress_check` | Get current V3 implementation progress percentage and metrics Use when native TodoWrite is wrong because you need cross-session goal-complet |
| `progress_summary` | Get human-readable V3 implementation progress summary Use when native TodoWrite is wrong because you need cross-session goal-completion trac |
| `progress_sync` | Calculate and persist V3 progress metrics to file Use when native TodoWrite is wrong because you need cross-session goal-completion tracking |
| `progress_watch` | Get current watch status for progress monitoring Use when native TodoWrite is wrong because you need cross-session goal-completion tracking  |

## federation (4)

| Tool | Description |
|---|---|
| `federation_bbs_human_join` | agentbbs — Mint a single-use Ed25519-signed token a human business owner presents to the agentbbs SSH/web front door to join a room (ADR-164 |
| `federation_bbs_publish` | agentbbs — Publish a domain event from a pod agent to a BBS room (ADR-164 Phase 1). Wraps the payload in a ReplicateMessage envelope (envelo |
| `federation_bbs_register` | agentbbs@~0.1.0 — Register a BBS room as a named federation peer (ADR-164 Phase 1). Maps a business-domain label like "#sales" or "#finance" |
| `federation_bbs_watch` | agentbbs — Poll recent envelopes from a BBS room (ADR-164 Phase 1). Returns envelopes newer than the optional sinceEnvelopeId, up to limit.  |

## mcp (3)

| Tool | Description |
|---|---|
| `mcp_start` | Report that the in-process MCP toolset is available (no-op "start" — if this tool responds, MCP is up). Use when native `claude mcp list` is |
| `mcp_status` | Get MCP server status, including stdio mode detection Use when native Claude Code MCP status is wrong because you need Ruflo-side server det |
| `mcp_stop` | No-op "stop" for the in-process MCP toolset (there is no separate server process to stop from inside an MCP call). Use when native process-k |

## business (2)

| Tool | Description |
|---|---|
| `business_pod_route_backend` | ADR-164 Phase 3 — Compute the domain-affinity routing decision for a business pod per ADR-164 §3.4 and return {backend, reason}. The three b |
| `business_pod_validate` | ADR-164 Phase 2 — Validate a business-pod template JSON against the schema in ADR-164 §3.3 (name, agents[], allowedMcpTools, bench, piiPolic |

## http (1)

| Tool | Description |
|---|---|
| `http_fetch` | ADR-164 §5.1.8 — HTTP probe primitive for business-pod ops benches (synthetic 200/500 endpoint checks, third-party status pages). Default-se |
