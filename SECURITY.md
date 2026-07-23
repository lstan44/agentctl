# Security policy

## Supported versions

During the `0.x` series, only the latest release receives security fixes.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose secrets,
execute code, escape managed roots, corrupt configuration, or compromise the
installer or release channel.

Use GitHub's private vulnerability reporting for
[`lstan44/agentctl`](https://github.com/lstan44/agentctl/security/advisories/new).
If that channel is unavailable, open a minimal issue asking for a private
contact without including exploit details.

Expect acknowledgement within five business days. We will coordinate validation,
remediation, release, and disclosure with the reporter.

## v0.2 trust boundary

`agentctl inspect` and `agentctl doctor`:

- read known configuration roots;
- hash skill definitions for duplicate analysis;
- inspect key names to identify potential secret-bearing fields;
- never execute skills, hooks, commands, plugins, or target CLIs;
- never send inspection data over the network;
- never write into agent configuration roots;
- never print detected secret values.

`agentctl agents status` is a narrow observation command that invokes only each
cataloged tool's documented version query with a five-second timeout.

`agentctl init` is a separate, explicit mutation. It defaults to `~/.agentctl`,
writes only to a new/empty or already-valid canonical root, and refuses to
overwrite unrelated files. Git initialization never creates a commit or remote.

Agent lifecycle mutations:

- expose an exact plan and make no change under `--dry-run`;
- require `--yes`;
- execute static argument arrays without a shell;
- block unsatisfied runtime and package-manager preconditions;
- preflight every batch plan before the first mutation;
- preserve agent-owned credentials and configuration;
- write a machine receipt only after the expected executable state is verified;
- retain desired state after external failure so drift remains explicit.

OpenClaw uninstall is a two-step static sequence: remove its managed Gateway
service, then remove the npm package. State and workspaces are not selected.
Hermes native installation is blocked for root, runs with setup/browser
bootstrap disabled, and receives an ephemeral `~/.local/bin` PATH entry so its
installer does not edit shell profiles. Hermes uninstall omits `--full`.

`agentctl self update` uses the bounded installer boundary and verifies the
replacement version command. The public installer receives a minimum-version
guard so self-update cannot silently downgrade an installation. Source and
version override variables are stripped from the child environment so the
self-update path remains pinned to the canonical release channel.
`agentctl self uninstall` removes only the managed command and version library
beneath the selected home; it rejects any target that could contain the
canonical root.

Remote native installers are restricted to static HTTPS URLs and final-origin
allowlists, capped at 1 MiB, bounded by a 30-second download timeout, required
to have a script shebang, hashed with SHA-256 for evidence, staged privately,
and executed with a fixed interpreter. The content hash is not an independent
signature. OpenCode native installation uses its no-PATH-modification mode.

## Installer model

The install script:

- downloads versioned artifacts from the public GitHub release;
- verifies a published SHA-256 checksum before extraction;
- installs without `sudo`;
- uses versioned directories and an atomic `current` symlink;
- does not modify shell startup files automatically.

Checksums protect against accidental corruption but are not independent
signature verification when the archive and checksum share the same release
channel. Signed provenance is a v1 release gate.

The CLI contains no telemetry client. The website uses no analytics code, and
production HTML sets `Cache-Control: no-transform` so Cloudflare does not
inject its optional browser analytics beacon.

## Threats we actively test

- secret-value disclosure in JSON or human output;
- path and symlink escape;
- mutation during read-only commands;
- unsafe overwrite during initialization;
- lifecycle execution without explicit confirmation;
- package-manager or runtime precondition bypass;
- remote-installer redirect, response-size, and script-format attacks;
- native uninstall path escape or unintended configuration deletion;
- false lifecycle success when the expected executable state is not observed;
- partial OpenClaw removal that leaves a broken managed Gateway service;
- Hermes root/FHS installation or shell-profile modification;
- self-uninstall path escape or canonical-root deletion;
- malicious configuration syntax causing crashes;
- installer checksum failure;
- incomplete or interrupted installation;
- target adapters claiming unsupported safety semantics.
