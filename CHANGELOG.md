# Changelog

All notable changes to agentctl are documented here.

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
