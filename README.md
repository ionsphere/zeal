# Zeal

A model-agnostic, multi-agent coding harness. The harness core is independent of model vendors and operating systems; inference and command execution are provided by adapters.

Zeal's direction combines SwarmForge's engineering workflows, GrokBot's agent runtime ergonomics, and Muse-inspired separation of execution from security policy. Local/self-hosted operation and per-agent model choice remain requirements. See the [harness design](docs/HARNESS-DESIGN.md) and [capability specification](docs/CAPABILITIES.md) for delivery order, implementation status, and acceptance criteria.

## Runtime status

| Platform | Status | Execution |
| --- | --- | --- |
| Windows + WSL | Primary / functional | `wsl.exe` + bash |
| Linux | Scaffolded | `/bin/bash` |
| macOS | Scaffolded | `/bin/zsh` |
| Windows native | Scaffolded | PowerShell |
| iOS | Scaffolded capability boundary | no arbitrary local process spawn; execution transport TBD |

On Windows, `auto` intentionally selects WSL because that is the first supported Windows runtime. Use `--platform windows` to exercise the native PowerShell adapter explicitly.

## Quick start: Windows + WSL

1. Install WSL (Ubuntu is fine): `wsl --install`.
2. Install Node.js 20+ on Windows.
3. Run `npm install`.
4. Point `WORKDIR` at an existing checkout you want the agent to modify.
5. Run:

```bash
npm run zeal -- "Fix the failing tests in the auth module"
```

On the first Meta-backed run, Zeal opens Meta's Model API portal. Sign in, create the one-click API key, and paste it once into the terminal. The key is then stored using OS-protected credential storage rather than a project `.env` file. Runs selecting another provider use that provider's credentials and never trigger Meta login.

The Windows path in `WORKDIR` is translated to `/mnt/<drive>/...` for commands executed inside WSL, while file editing stays in the host process. This allows Windows and WSL to operate on the same checkout.

## Authentication

Explicit login is also available:

```bash
npm run zeal -- login
npm run zeal -- auth status
npm run zeal -- logout
```

Credential storage:

- Windows: DPAPI protected for the current Windows user
- macOS: Keychain
- Linux: Secret Service via `secret-tool`

Environment variables remain supported for CI and advanced setups. Credential resolution order is:

1. `META_MODEL_API_KEY`
2. OS secure credential store
3. interactive login

Meta currently exposes Model API access through account signup plus one-click API key creation; Zeal therefore performs a browser handoff and one-time paste rather than pretending a third-party OAuth/device-code flow exists.

## Platform selection

Automatic selection:

- Windows -> `wsl`
- macOS -> `macos`
- Linux -> `linux`

Override with either:

```bash
npm run zeal -- --platform linux "Implement the feature"
```

or `ZEAL_PLATFORM=wsl|linux|macos|windows|ios`.

## Models and providers

Select a model with `provider/model`:

```text
npm run zeal -- --model kimi/kimi-k2 "Fix the failing tests"
npm run zeal -- --model qwen/qwen3-coder-plus "Implement the feature"
npm run zeal -- --model openai/gpt-5.4 "Review this change"
```

Built-in OpenAI-compatible adapters cover Meta, OpenAI, xAI, Kimi/Moonshot, Qwen/DashScope, OpenRouter, Ollama, and a custom endpoint. `--list-providers` prints the registry. Different child agents may use different providers and models.

The adapter interface is intentionally independent from Chat Completions so native Responses, Anthropic, or other protocols can be added without changing the agent runtime.

## Declarative swarms

Define role-specific models, prompts, dependencies, receive modes, and workspace isolation in `zeal.swarm.json`. See `zeal.swarm.example.json` for a Specifier → Coder → Reviewer workflow.

```bash
npm run zeal -- swarm --config zeal.swarm.json "Add account recovery"
```

Roles whose dependencies are satisfied run concurrently. A `worktree` role receives its own Git branch and checkout under `.zeal/worktrees/`. Downstream roles receive atomic handoff records containing a verified 40-character commit ID and bounded summary under `.zeal/handoffs/`. Set `workspace` to `shared` only for a role that intentionally operates on the main checkout.

`WORKDIR` may point at the repository itself, an ordinary subdirectory, or a nested Git checkout. A nested checkout wins even when its directory is ignored by the parent repository. An ignored placeholder with no nested `.git` is rejected instead of silently targeting the parent; initialize or clone a repository there, or set `WORKDIR=.` to target the parent explicitly.

Fully isolated swarms start from committed `HEAD` and may run while the main checkout has local changes—the CLI lists those paths and makes clear they are excluded. A swarm containing any `shared` role still requires a clean checkout and reports the exact blocking paths plus remediation.

Each role may declare ordered `gates` with a name, command, and timeout plus `maxAttempts`. A failed gate sends bounded output back to that role for correction; no downstream handoff occurs until every gate passes and the worktree is clean. Run state is atomically recorded under `.zeal/runs/`.

Promotion and cleanup are explicit lifecycle operations:

```bash
npm run zeal -- swarm promote <run-id> <role>
npm run zeal -- swarm cleanup <run-id>
```

Promotion requires a clean target checkout and creates an explicit merge of the role's verified commit, including multi-parent swarm results. Cleanup refuses dirty worktrees and preserves their branches, keeping recovery possible.

## Harness tools

- `read_file` - bounded UTF-8 file reads
- `glob` - portable wildcard file discovery
- `grep` - portable literal text search
- `apply_patch` - Codex-style Add/Update/Delete patch operations
- `run_command` - platform-adapter command execution with timeout and streamed output
- `spawn_subagent` - start a concurrent delegated agent, optionally on another provider/model
- `list_agents`, `wait_agents`, `send_agent` - observe, join, and steer child agents

All filesystem tools reject paths that escape `WORKDIR`.

This containment applies to filesystem tools, not arbitrary shell commands. Git worktrees isolate source changes; they do not isolate processes, credentials, or network access. The current runtime has the authority of the account running it. OS credential storage is not yet a separate credential broker, and the mutable JSONL activity journal is not a protected audit log. The declared security capabilities are planned, not currently enforced.

## Long-run behavior

Planned: a harness-enforced completion loop recalls the model after a completion claim to compare the result with the user's request. Missing requirements trigger correction and revalidation; exhausted budgets or blockers are reported as incomplete. This applies to individual agents and final swarm results alongside executable gates. See [forced completion validation](docs/CAPABILITIES.md#forced-completion-validation-loop). The current runtime does not yet enforce this recall.

The agent preserves native model tool-call IDs and sends tool results back as `role: tool`, which is required for sustained multi-turn tool use. A JSONL journal records assistant and tool activity. See [the harness design](docs/HARNESS-DESIGN.md) for the Grok Build and SwarmForge comparison and implementation roadmap.

## Development

```bash
npm run check
```

This runs TypeScript compilation and the portable tests.

## Next platform work

The shared `PlatformAdapter` is the extension seam. Linux, macOS, and native Windows already have command adapters but still need platform-specific integration tests, permission/sandbox policy, and packaging. iOS deliberately exposes `run_command` as unavailable until an embedded or remote execution transport is selected rather than pretending iOS supports unrestricted process spawning.
