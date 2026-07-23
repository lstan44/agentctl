# Changelog

All notable changes to agentctl are documented here.

## 0.2.0 — 2026-07-23

### Added

- Canonical root resolution at `~/.agentctl`, `AGENTCTL_ROOT`, or `--root`.
- Idempotent Git-backed `agentctl init` with explicit GitHub push guidance.
- Version-controlled desired tool state and ignored machine receipts.
- Provider-agnostic lifecycle catalog for Codex, Claude Code, OpenCode, Gemini
  CLI, GitHub Copilot CLI, OpenClaw, and Hermes Agent.
- Plan-first status, install, update, and configuration-preserving uninstall
  across reviewed npm, Homebrew, and native channels.
- Channel inference, runtime preconditions, post-operation verification, and
  visible desired-vs-observed drift.
- Bounded, allowlisted native installer execution with SHA-256 evidence.
- Verified, plan-first agentctl self-update and canonical-root-preserving
  self-uninstall.
- OpenClaw service-aware update/uninstall and exact Node engine gating.
- Unprivileged Hermes install/update/uninstall with state preservation and no
  shell-profile edits.
- Lifecycle JSON schemas, official-source documentation, and adversarial tests.

### Hardened

- Preflight complete batches before the first mutation.
- Reject stale channel receipts, untrusted installer redirects, oversized or
  timed-out downloads, and agentctl version downgrades.
- Pin self-update to the canonical release source while preserving destination
  overrides.
- Produce reproducible release archives and atomically activate symlinked
  installations.

## 0.1.1 — 2026-07-23

- Replace the active install symlink with a portable atomic rename.
- Add regression coverage for repeat installation and activation invariants.

## 0.1.0 — 2026-07-23

### Added

- Read-only inspection across Codex, Claude Code, Gemini CLI, OpenCode, and Cursor.
- Duplicate skill and same-name divergence analysis.
- Skill script, hook, MCP, and potential secret-key surface inventory.
- Stable `agentctl.inspect/v1alpha1` JSON output.
- `doctor`, `init`, `version`, and help commands.
- Checksum-verified, no-sudo macOS and Linux installer.
- Static documentation and security site for agentctl.justrepl.com.
