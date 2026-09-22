# Zeal capability specification

Initial declaration: September 8, 2026. This specification enables no new runtime permissions or configuration keys. Capability support, requested authority, and granted authority are separate concepts; support does not imply permission.

## Existing foundation

| Capability ID | Status | Evidence and limits |
| --- | --- | --- |
| `model.select` | Implemented | `src/models.ts`: per-agent provider/model selection, including compatible Kimi/Qwen APIs; feature negotiation pending |
| `agent.delegate` | Implemented | `src/coordinator.ts`: concurrency and steering; authority attenuation pending |
| `swarm.graph` | Implemented | `src/swarm/config.ts`, `runner.ts`: dependencies and role models |
| `workspace.worktree` | Implemented | `src/swarm/git.ts`: source isolation, no OS boundary |
| `handoff.commit` | Implemented | `src/swarm/handoffs.ts`: durable verified commit handoffs |
| `verification.gate` | Implemented | `src/swarm/gates.ts`: ordered gates, bounded correction; commands retain account authority |
| `workspace.files` | Partial | `src/tools/fs-tools.ts`: bounded tools and containment; shell execution is outside this guarantee |
| `credential.store` | Partial | `src/auth/credential-store.ts`: OS storage; separate broker pending |
| `activity.journal` | Partial | `src/tools/journal.ts`: mutable JSONL, no protected audit or session replay |

Implemented describes the named behavior, not certification of every platform/model combination. Existing `PlatformCapabilities` flags describe shell, filesystem, and process-spawn availability, not security enforcement.

## Required capabilities

All following capabilities are **planned**. IDs provide stable vocabulary for future contracts, tests, and documentation.

| ID | Required behavior | Acceptance evidence |
| --- | --- | --- |
| `capability.negotiate` | Versioned support, scope, backend, and limitations; validate requirements before starting | Unsupported requirements stop execution with precise reasons; optional degradation is explicit |
| `completion.validate` | Mandatory model recall after proposed completion compares actual results and evidence with the current user request; gaps trigger corrective work and another validation | Premature completion, omitted requirements despite passing tests, stale evidence, and invalid verdicts cannot produce success; exhaustion returns incomplete |
| `policy.authorize` | Host-controlled decisions on typed actions and resource scopes; restricted profiles default deny | Tools, shells, gates, plugins, and children cannot bypass decisions or edit effective policy |
| `approval.bind` | Approval binds actor, action digest, resources, policy revision, expiry, and permitted uses | Changed arguments, replay, expiry, or another agent invalidate approval; model text cannot approve |
| `authority.delegate` | Child grants are subsets of parent grants and run limits; revocation propagates | Model switching, nested delegation, and handoffs cannot expand authority |
| `execution.isolate` | Confined filesystem/process tree and resource limits; no writable control-plane mounts | Commands cannot access host secrets, sibling cells, policy, or audits; descendants terminate on cancellation |
| `network.mediate` | Check every outbound route against destination, protocol, operation, and data-release scope | Shell, redirect, DNS/address changes, direct-IP, and plugin bypass tests fail; local inference also needs scoped access |
| `credential.broker` | Credentials stay outside agent-visible messages, files, environment, and arguments; resolve handles at approved destinations | Commands cannot obtain raw credentials or redirect tokens; logs redact sensitive values |
| `data.provenance` | Preserve untrusted/sensitive origins across tools, files, summaries, handoffs, and outbound requests | Summarization and delegation do not erase restrictions; unknown provenance remains conservative |
| `audit.protect` | Ordered, redacted action/decision/approval/grant/outcome events outside execution, with integrity checks | Agent cannot forge/remove history; missing/altered events are detected; audit failure blocks protected actions |
| `session.recover` | Durable checkpoints/replay outside execution with cancellation and budgets | Restart retains completed work, revalidates grants, and reconciles uncertain side effects before retrying |
| `extension.constrain` | Plugins, MCP tools, hooks, and skills obey the same authority contracts | Extensions get only declared grants; subprocess/network bypass fails; text cannot grant authority |
| `events.observe` | Versioned action, approval, diff, lifecycle, usage, and error events | Two clients reconstruct consistent run state without parsing prose or exposing secrets |
| `goal.schedule` | Durable schedules/events with bounded scope, budget, cancellation, and visible status | Restart avoids duplicate work; expired authority pauses dependent actions |
| `memory.control` | Scoped persistent memory with inspect/export/delete and provenance | Cross-project retrieval requires scope; retention/deletion include derived memory |

## Forced completion-validation loop

`completion.validate` is a required harness behavior for top-level work and delegated roles. Today `src/agent.ts` exits on `TASK_DONE` without tool calls, or returns its last content after the step limit. Neither path performs a separate completion review. Existing executable swarm gates verify configured commands; they do not establish that the full user request was satisfied.

The harness owns this sequence:

1. Preserve the user request, accepted clarifications, constraints, and acceptance criteria as a versioned task record. A delegated role is assessed against its assigned scope; the parent remains responsible for the full user request.
2. Treat a completion claim as a candidate result. Before reporting success or releasing a successful handoff, recall the model in a dedicated validation pass with the task record, candidate output, actual artifact/diff references, relevant tool results, gate outcomes, and unresolved issues. Use bounded evidence with retrieval for missing details; the agent's summary alone is insufficient.
3. Require a structured verdict: `satisfied`, `needs_work`, or `blocked`, with requirement-by-requirement evidence, concrete gaps, and any blocking reason. The validator may inspect evidence within existing grants; corrections run through the normal worker loop. Invalid or unsupported verdicts cannot mean success.
4. On `needs_work`, feed the gaps back into the worker, perform authorized corrections, rerun affected checks, and validate again. Bind verdicts to task and artifact revisions; later edits or user steering invalidate a prior pass.
5. Permit success only after a valid `satisfied` verdict and all mandatory executable gates pass on the same candidate. For swarms, validate each role before handoff and validate the assembled result against the full request before declaring overall completion.

The default recall uses the selected model. Configurable review depth may add a fresh context or a separately selected provider/model, subject to data-release policy, but every completion requires at least one dedicated pass. Review depth, corrective-attempt limits, and total token/time budgets belong to harness configuration, not the acting model's discretion. These are proposed settings, not current configuration keys.

Reserve budget for validation. Budget exhaustion, cancellation, repeated lack of progress, and unresolved blockers produce explicit non-success outcomes with remaining gaps and preserved work. They must never be relabeled as completion. The loop cannot expand authority, invent requirements, or keep retrying an action that needs user input. Persist attempts, evidence references, verdicts, and consumed budgets; recovery must not reset limits or accept stale validation.

Model review is fallible. This loop adds an evidence-based assessment of request coverage alongside deterministic checks; neither substitutes for the other. Acceptance tests must include a passing test suite with an omitted user requirement, a premature `TASK_DONE`, a correction followed by successful revalidation, changed requirements/artifacts after review, invalid verdicts, a blocked action, and exhausted budgets. Cross-model evals should measure missed gaps and unnecessary correction loops.

## Declaration and grant contract

The first implementation should define three versioned records:

- **Support report:** ID, contract version, status (`supported`, `unsupported`, `experimental`), backend, enforceable scope, limitations, verification reference. Experimental support cannot satisfy a restricted profile's guarantees.
- **Requirement:** ID, required/optional designation, resource scope. Scope includes canonical workspace roots, destinations/operations, credential handles, execution limits, and data-release restrictions as applicable. Omission never means unrestricted access.
- **Grant:** opaque authority-issued ID, subject/run/parent identity, capability, narrowed scope, policy revision, expiry, revocation state, and usage limits. Executors validate grants with the authority; agent-supplied IDs alone establish nothing.

An action request carries version, request ID, actor/run identity, operation, canonical resources, arguments digest, provenance references, and requested grant. Decisions return allow, deny, or approval-required with stable reason codes. Executors bind execution to the approved request and validate at use time to prevent changes after approval. Approvals arrive through a trusted operator channel outside model-generated content.

These are proposed contracts, not accepted CLI or swarm JSON syntax. Runtime parsing, migration/version rules, and adapter conformance tests accompany implementation.

## Enforcement scope

The threat model includes malicious repository/tool content influencing an agent and arbitrary programs it launches. It assumes a trusted host administrator and OS; a compromised host kernel is outside the initial boundary.

Policy, grants, credentials, durable state, and auditing belong to the trusted control plane. Editable code, subprocesses, downloaded content, and extension runtimes belong to execution cells. Inference requests also cross a data-release boundary: model selection does not authorize sending every file or secret to a provider.

Worktrees share Git metadata. Restricted execution must broker Git operations or use isolated repositories with controlled import/export; mounting the host Git common directory writable would undermine isolation. Verified handoff semantics must survive that implementation choice.

Provenance cannot prove natural-language output contains no secrets. Conservative propagation and explicit release policy remain necessary. OS credential storage also does not protect against commands with the same user's credential access.

A future restricted profile requires policy, applicable approvals, delegation constraints, isolation, mediated egress, credential brokering, provenance, and protected audits together. A command allowlist alone cannot satisfy it. Existing unrestricted execution must be labeled accurately and cannot silently satisfy restricted requirements.

## First delivery slice

1. Implement support/requirement records and startup validation with accurate adapter support.
   Include the versioned task record and completion verdict contract; implement mandatory recall and bounded correction in the core agent loop without waiting for scheduled goals or client work.
2. Introduce typed actions and authority checks at every execution entry point, including swarm gates and inference; implement grant attenuation and approval binding.
3. Provide protected authority/audit storage and one isolated backend with brokered credentials and mediated egress. Select the backend through an implementation design and platform verification.
4. Verify denied host-secret reads and unapproved traffic, approval replay rejection, child-authority attenuation, and recovery of uncertain external actions before advertising restricted execution.

Durable sessions, workflow extensions, and scheduled goals follow the [architecture roadmap](HARNESS-DESIGN.md#next-runtime-layers).
