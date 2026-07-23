# agentctl

**Know what controls your agents.**

`agentctl` is the open-source, local-first control plane for AI agent
environments. Its first release inventories the skills, guidance, agents,
commands, hooks, MCP configuration, executable surfaces, duplication, and
possible secret-bearing fields spread across your coding agents—without changing
a file.

Developed by [justREPL](https://justrepl.com).

## Install

```sh
curl -fsSL https://agentctl.justrepl.com/install.sh | bash
```

The installer:

- supports macOS and Linux;
- installs into `~/.local` by default without `sudo`;
- downloads a versioned release from GitHub;
- verifies its SHA-256 checksum before activation;
- requires Node.js 20 or newer;
- never modifies an agent configuration.

Then inspect your environment:

```sh
agentctl inspect
```

Machine-readable output is a first-class interface:

```sh
agentctl inspect --json
agentctl doctor --json
```

## What v0.1 does

- Detects Codex, Claude Code, Gemini CLI, OpenCode, and Cursor environments.
- Counts skills, guidance, commands, agents, rules, hooks, and MCP surfaces.
- Finds byte-identical skills that can share one canonical source.
- Flags same-name skills whose definitions have diverged.
- Identifies executable files inside skill packages.
- Detects possible secret-bearing keys without printing their values.
- Produces a stable JSON report suitable for agents and CI.
- Scaffolds an empty Agent Environment as Code repository with `agentctl init`.

`inspect` and `doctor` are read-only. `init` writes only to the new directory
explicitly supplied by the user and refuses to overwrite existing files.

## Commands

```text
agentctl inspect [--json] [--home PATH] [--target ID] [--strict]
agentctl doctor  [--json] [--home PATH]
agentctl init [DIRECTORY] [--dry-run] [--json]
agentctl version [--json]
agentctl help
```

## Why not just sync dotfiles?

Files can be identical while their meaning differs across agent products.
`agentctl` models desired, rendered, filesystem, runtime, and behavioral truths
separately. The roadmap adds target-native compilation, capability-loss
accounting, atomic apply, rollback, secret references, and conformance evidence
without flattening every agent into a lowest common denominator.

Read the [product contract](docs/product-contract.md), [design contract](docs/design-contract.md),
and [security model](SECURITY.md).

## Development

```sh
npm install
npm run check
npm run agentctl -- inspect --home ./test/fixtures/home
npm run dev
```

The CLI has no runtime dependencies beyond Node.js. The website is static HTML,
CSS, and JavaScript deployed as Cloudflare Worker static assets.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). By contributing, you agree to the
[Developer Certificate of Origin](https://developercertificate.org/) sign-off
described there and the project [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
