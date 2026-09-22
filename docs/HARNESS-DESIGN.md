# Zeal harness architecture

Zeal is a model-agnostic agent runtime. Models propose actions; the harness owns context, tools, permissions, concurrency, state, and verification.

## Reference comparison

| Concern | Grok Build / GrokBot | SwarmForge | Zeal direction |
| --- | --- | --- | --- |
| Model binding | Grok runtime first, with provider bridges | Launches independent Codex, Claude, Copilot, or Grok CLIs per role | Native provider interface; every agent selects its own provider/model |
| Topology | Primary agent with dynamic subagents and optional councils | Configured role pipeline (`two-pack`, `four-pack`, `six-pack`) | Both dynamic delegation and declarative role graphs |
| Isolation | Sessions, permissions, sandbox profiles, optional worktrees | One Git worktree per editing role | Explicit workspace policy: shared read-only, shared edit, or isolated worktree |
| Coordination | Runtime-managed subagents, queues, steering, interruption | Durable, validated file handoffs through a daemon | Run-scoped coordinator plus durable event/handoff store |
| Policy | Rules, skills, hooks, MCP, permissions | Layered project constitution and role prompts | Layered policy files plus enforceable tool/command gates |
| UX | Full TUI/desktop, history, preview, remote agent, schedules | Observable tmux sessions | Normalized event stream first; TUI/desktop/remote clients consume it |
| Durability | Resumable sessions and checkpoints | Local handoff queues and Git commits | Atomic sessions, event journal, checkpoints, resumable agents |

GrokBot is a reference for runtime ergonomics and product surfaces. SwarmForge is a reference for named roles, isolated worktrees, validated handoffs, and quality gates. Zeal combines these without embedding a vendor CLI as its runtime. GrokBot's provider choice is distinct from its reliance on the Grok Build runtime.

### Muse App and the security boundary

The September 2026 Muse comparison adds a third influence: a persistent personal agent whose execution environment is separated from the authority granting credentials and external actions. Zeal adopts this separation while retaining local/self-hosted deployment and independent model selection.

| Reference | Lessons for Zeal | Limits of the comparison |
| --- | --- | --- |
| SwarmForge | Explicit roles, Git isolation, durable handoffs, engineering discipline | Worktrees do not provide process or network isolation |
| GrokBot / Grok Build | Sessions, delegation, model routing, tools, observable clients | Provider choice and runtime independence are distinct |
| Muse App | Separate policy authority, credential brokering, mediated egress, durable state outside execution | Internal subagents do not establish a user-configurable engineering swarm protocol |

Per-role models, configurable graphs, and commit-based handoffs remain Zeal requirements rather than claimed Muse features. The security mechanisms below are proposed requirements; Zeal has not implemented Meta's architecture.

Sources: [SwarmForge](https://github.com/unclebob/swarm-forge), [GrokBot](https://github.com/Franzferdinan51/GrokBot), [Introducing Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/), [Meta security architecture](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse). Comparison recorded September 8, 2026. The Meta security page could not be re-fetched during this update; its details are carried forward from the preceding research.

### Authority and execution

Models propose typed actions. A host-controlled authority returns allow, deny, or approval-required decisions. Executors consume scoped grants; they cannot change policy, forge approvals, obtain broker credentials, or alter protected audit records. Child agents inherit equal or smaller authority, including when they switch providers.

Editable files and untrusted processes live inside execution cells. Policy, credentials, approvals, durable state, and audit storage live outside them. Shell processes, gates, extensions, connectors, and inference requests all cross enforced boundaries. Prompt instructions and command-string filtering cannot establish this guarantee.

Process-spawn availability is separate from confinement support. Runs requiring unsupported security capabilities must fail before execution. See [CAPABILITIES.md](CAPABILITIES.md) for declarations, current status, and acceptance criteria.

## Implemented foundation

- `ModelProvider` is the inference boundary.
- `ModelRegistry` supports Meta, OpenAI, xAI, Kimi/Moonshot, Qwen/DashScope, OpenRouter, Ollama, and arbitrary OpenAI-compatible servers.
- A model is selected as `provider/model` globally or per spawned agent.
- `AgentCoordinator` starts concurrent agents, tracks lifecycle, waits for results, and accepts steering messages.
- All agents retain the existing work-directory containment rules.
- Declarative swarms define role-specific models, prompts, dependencies, receive modes, and workspace policies.
- Editing roles can run in isolated Git worktrees, and dependency edges produce atomic, commit-verified handoffs.
- Ordered executable quality gates block handoffs, with bounded corrective attempts and durable run manifests.
- Promotion and cleanup are explicit: promotion requires a clean checkout; cleanup refuses dirty worktrees and preserves branches.

## Next runtime layers

Forced completion validation is a core runtime requirement. A completion claim triggers a separate model call comparing the actual result and verification evidence against the user request and accepted updates. Gaps return to the worker for correction and another review. Success requires a current passing verdict plus mandatory gates; budgets or blockers yield an explicit incomplete outcome. Apply this to role handoffs and the assembled top-level result. See [the loop contract](CAPABILITIES.md#forced-completion-validation-loop) for verdicts, evidence, limits, and acceptance cases. This is planned; the current `TASK_DONE` exit does not implement it.

1. Capability/action and completion contracts: versioned support reports, scoped requirements, typed actions, authority inheritance, fail-closed negotiation, and mandatory completion recall with bounded corrective loops. Initial declarations are in [CAPABILITIES.md](CAPABILITIES.md); implementation is pending.
2. Security authority: policy decisions, expiring action-bound approvals, protected audit events, and credential brokering outside execution.
3. Enforced execution boundary: one verified backend with process/filesystem isolation, mediated egress including inference, and provenance tracking. Advertise restricted execution only after adversarial tests pass; other platforms report actual support.
4. Durable sessions: atomic metadata, replay, checkpoints, cancellation, budgets, and context compaction outside execution cells. Recovery revalidates grants and reconciles uncertain external actions before retrying.
5. Swarm extensions: promotion strategies, branch retention, conditional transitions, and specialist gates, preserving existing verified handoffs and corrective attempts.
6. Extensions and clients: skills, MCP, plugins, typed hooks, and normalized events under the same authority boundary.
7. Persistent goals: schedules, event-driven work, scoped memory, and visible activity built on durable sessions and grants.

Verification accompanies each layer: boundary bypass tests, handoff/recovery tests, and cross-provider evals. An interface declaration or an approval prompt alone is not evidence of enforcement.

## Non-goals

- Pretending every provider has identical capabilities. Provider adapters expose capabilities and the runtime degrades explicitly.
- Sending an entire repository to a model provider. Only model-visible messages and requested tool results cross the inference boundary.
- Depending on tmux, Electron, or a specific vendor CLI in the core runtime.
