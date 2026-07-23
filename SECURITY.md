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

## v0.1 trust boundary

`agentctl inspect` and `agentctl doctor`:

- read known configuration roots;
- hash skill definitions for duplicate analysis;
- inspect key names to identify potential secret-bearing fields;
- never execute skills, hooks, commands, plugins, or target CLIs;
- never send inspection data over the network;
- never write into agent configuration roots;
- never print detected secret values.

`agentctl init` is a separate, explicit mutation. It writes only to a new or
empty directory selected by the user and refuses to overwrite existing files.

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

## Threats we actively test

- secret-value disclosure in JSON or human output;
- path and symlink escape;
- mutation during read-only commands;
- unsafe overwrite during initialization;
- malicious configuration syntax causing crashes;
- installer checksum failure;
- incomplete or interrupted installation;
- target adapters claiming unsupported safety semantics.
