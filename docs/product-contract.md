# Product contract

## Category

Agent Environment as Code.

## Promise

Define your agent environment once. Inspect, provision, reproduce, and prove it
everywhere.

## v0.2 outcome

A high-agency AI engineer can install one local tool, understand the agent
environment already present, initialize a canonical Git repository, and safely
manage the supported agentic CLI lifecycle—including the control plane
itself—without surrendering credentials or configuration ownership.

## Truth model

`agentctl` keeps five configuration truths distinct:

1. **Desired truth** — canonical intent in version control.
2. **Rendered truth** — target-native artifacts produced by an adapter.
3. **Filesystem truth** — artifacts currently present on a machine.
4. **Runtime truth** — resources the target reports or demonstrates it loaded.
5. **Behavioral evidence** — observations from bounded conformance tasks.

Tool lifecycle also keeps **declared installation intent** separate from
**observed machine state**. A failed install can therefore produce visible
`missing` drift instead of a false success.

## Product principles

- Local-first and useful without an account.
- Vendor-neutral but target-native.
- Observe before manage.
- Plan before apply.
- Secrets are references, never repository content.
- Deterministic where possible and explicit about uncertainty.
- Human-readable and machine-readable interfaces have semantic parity.
- No telemetry by default in the CLI.
- No execution during inspect, import, render, or plan.
- Narrow, documented execution during status and confirmed lifecycle operations.
- Safety, portability, and verification remain open source.

## v0.2 boundary

Implemented:

- read-only configuration inspection and environment diagnostics;
- canonical root resolution at `~/.agentctl`, `AGENTCTL_ROOT`, or `--root`;
- idempotent canonical repository initialization with optional Git setup;
- version-controlled desired tool state and ignored machine receipts;
- static lifecycle registry for Codex, Claude Code, OpenCode, Gemini CLI,
  GitHub Copilot CLI, OpenClaw, and Hermes Agent;
- version status, installation-channel inference, lifecycle plans, explicit
  confirmation, install, update, and configuration-preserving uninstall;
- npm, Homebrew, and selected official native channels;
- plan-first, verified agentctl self-update and canonical-root-preserving
  self-uninstall;
- stable JSON contracts, public documentation, and checksum-verifying installer.

Specified, not yet implemented:

- importing and adopting existing target configuration;
- semantic adapters and target-native rendering;
- capability-loss analysis;
- content-addressed configuration plans;
- atomic configuration apply and rollback;
- secret-manager providers;
- runtime discovery and behavioral verification;
- Agent Environment Bill of Materials;
- cryptographically signed release provenance.

The lifecycle manager is intentionally not a general-purpose arbitrary package
runner. Its executable recipes are static, reviewed product data.

## Definition of done for v0.2

- `agentctl init` defaults to `~/.agentctl`, never overwrites unrelated files,
  and explains how to commit and push the repository.
- `inspect` and `doctor` never write or invoke agent code.
- `agents status` executes only documented version queries.
- Lifecycle work is inspectable with `--dry-run` and requires `--yes`.
- Unsupported or unknown installation channels fail closed.
- Tool configuration and credentials survive uninstall by default.
- OpenClaw Gateway service removal precedes package uninstall; OpenClaw state
  remains intact.
- Hermes native install is unprivileged, skips setup/browser bootstrap, and
  cannot edit shell profiles through a missing PATH entry.
- Self-uninstall cannot target a path outside the selected home or a library
  path containing the canonical root.
- Remote installers are downloaded over HTTPS from allowlisted final origins,
  bounded by size, validated as scripts, and recorded by SHA-256.
- Fixture tests cover lifecycle success, drift, channel inference,
  preconditions, untrusted redirects, and preservation boundaries.
- GitHub source, release artifacts, docs, and production Cloudflare site agree
  on the current contract.
