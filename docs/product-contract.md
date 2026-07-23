# Product contract

## Category

Agent Environment as Code.

## Promise

Define your agent environment once. Inspect, reproduce, and prove it everywhere.

## Initial outcome

A high-agency AI engineer can install one local tool and obtain a useful,
secret-safe account of what controls Codex, Claude Code, Gemini CLI, OpenCode,
and Cursor before granting write authority.

## Truth model

`agentctl` keeps five truths distinct:

1. **Desired truth** — canonical intent in version control.
2. **Rendered truth** — target-native artifacts produced by an adapter.
3. **Filesystem truth** — artifacts currently present on a machine.
4. **Runtime truth** — resources the target reports or demonstrates it loaded.
5. **Behavioral evidence** — observations from bounded conformance tasks.

The v0.1 inspector observes filesystem truth. It does not imply runtime or
behavioral verification.

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
- Safety, portability, and verification remain open source.

## v0.1 boundary

Implemented:

- read-only inspection;
- environment diagnostics;
- safe canonical repository scaffolding;
- JSON report contract;
- static public documentation and installer.

Specified, not yet implemented:

- import and adoption;
- semantic adapters and rendering;
- capability-loss analysis;
- content-addressed plans;
- atomic apply and rollback;
- secret-manager providers;
- discovery and behavioral verification;
- Agent Environment Bill of Materials.

Public copy must preserve this distinction.

## Definition of done for v0.1

- The inspector never writes into an agent home.
- Potential secret values never appear in reports.
- Fixture tests cover duplicates, divergence, scripts, and secret-bearing keys.
- The installer verifies checksums and uses no `sudo`.
- The site describes current and planned capability truthfully.
- GitHub source and release artifacts are public.
- The production domain serves the site and installer over HTTPS.
