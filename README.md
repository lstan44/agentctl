# agentctl

**One control plane for the tools and configuration that power your agents.**

`agentctl` is an open-source, local-first Agent Environment as Code control
plane. It inventories what controls your coding agents, initializes a canonical
Git-backed environment, and safely plans and manages the CLI lifecycle for
Codex, Claude Code, OpenCode, Gemini CLI, GitHub Copilot CLI, OpenClaw, and
Hermes Agent. It can also update or uninstall its own managed release.

Developed by [justREPL](https://justrepl.com).

## Install agentctl

```sh
curl -fsSL https://agentctl.justrepl.com/install.sh | bash
```

The installer supports macOS and Linux, requires Node.js 20 or newer, installs
into `~/.local` without `sudo`, verifies the GitHub release archive SHA-256, and
does not edit shell startup files or agent configuration.

## Establish your canonical agent root

```sh
agentctl init
```

This initializes `~/.agentctl` (or `AGENTCTL_ROOT`) and, when Git is available,
runs `git init -b main`. It never creates a commit or remote for you. To use
another directory:

```sh
agentctl init ~/src/my-agent-environment
agentctl init --no-git
agentctl root
```

The generated repository separates:

- version-controlled desired state in `agentctl.yaml`, `catalog/`, and
  `targets/`;
- ignored machine observations and operation receipts under
  `.agentctl/state/`;
- agent-owned credentials and configuration, which remain outside the
  repository.

Review the files, commit them, create a private or public GitHub repository, and
push:

```sh
cd ~/.agentctl
git add .
git commit -m "Initialize canonical agent environment"
git remote add origin git@github.com:YOUR-USER/YOUR-AGENT-ENV.git
git push -u origin main
```

## Inspect and manage agentic tools

```sh
agentctl agents list
agentctl agents status

agentctl agents install codex --dry-run
agentctl agents install codex --yes
agentctl agents update codex --yes
agentctl agents uninstall codex --yes
```

Lifecycle commands always show an exact plan and require `--yes`; `--dry-run`
never changes desired or machine state. Existing Homebrew, npm, and supported
native installations are detected from executable provenance. Uninstall
operations preserve agent-owned configuration and credentials.

The supported v0.2 catalog is:

| Tool | Default | Alternatives |
| --- | --- | --- |
| OpenAI Codex CLI | npm | Homebrew cask |
| Claude Code | Anthropic native installer | npm, Homebrew cask |
| OpenCode | npm | Homebrew formula, native installer |
| Gemini CLI | npm | Homebrew formula |
| GitHub Copilot CLI | npm | Homebrew cask |
| OpenClaw | npm | — |
| Hermes Agent | Nous Research native installer | — |

OpenClaw uses its supervised updater so a managed Gateway is coordinated and
verified. Its uninstall first removes the Gateway service, then the npm package,
while retaining `~/.openclaw`. Hermes installs without setup or browser
bootstrap, avoids shell-profile edits, uses its backup-aware updater, and
preserves `~/.hermes` on uninstall.

## Update or uninstall agentctl

```sh
agentctl self update --dry-run
agentctl self update --yes
agentctl self uninstall --dry-run
agentctl self uninstall --yes
```

Self-update downloads the canonical installer, validates its HTTPS origin,
records the script digest as execution evidence, then relies on the release
installer's GitHub archive checksum verification. It refuses a replacement
older than the running version. Self-uninstall removes the managed command and
version library but explicitly preserves the canonical `~/.agentctl`
repository and every agent's configuration.

See the [tool lifecycle contract](docs/tool-lifecycle.md) for official sources,
channel behavior, failure semantics, and safety boundaries.

## Inspect existing agent environments

```sh
agentctl inspect
agentctl inspect --json
agentctl doctor --json
```

`inspect` inventories Codex, Claude Code, Gemini CLI, OpenCode, and Cursor
configuration roots; finds duplicate and divergent skills; counts script, hook,
and MCP surfaces; and detects possible secret-bearing key names without
reporting their values. `inspect` and `doctor` never invoke agent tools, skills,
scripts, hooks, plugins, or MCP servers and never write into agent roots.

`agents status` has a different, narrow contract: it invokes only each
cataloged tool's documented version query.

## Commands

```text
agentctl inspect [--json] [--home PATH] [--target ID] [--strict]
agentctl doctor [--json] [--home PATH]
agentctl init [DIRECTORY] [--dry-run] [--no-git] [--json]
agentctl root [--root PATH] [--json]
agentctl agents list [--json]
agentctl agents status [TOOL] [--root PATH] [--home PATH] [--json]
agentctl agents install <TOOL|--all> [--channel ID] [--dry-run|--yes]
agentctl agents update <TOOL|--all> [--channel ID] [--dry-run|--yes]
agentctl agents uninstall <TOOL> [--channel ID] [--dry-run|--yes]
agentctl self update [--dry-run|--yes] [--json]
agentctl self uninstall [--dry-run|--yes] [--json]
agentctl version [--json]
agentctl help
```

All reports and plans expose versioned JSON contracts. The CLI has no runtime
dependencies beyond Node.js.

## Truth model

Files can be identical while their meaning differs across agent products.
`agentctl` keeps desired, rendered, filesystem, runtime, and behavioral truths
separate. Tool lifecycle adds another explicit boundary: version-controlled
desired tool state is not silently equated with observed machine installation.
Failed external operations remain visible as drift.

Read the [product contract](docs/product-contract.md),
[tool lifecycle contract](docs/tool-lifecycle.md),
[design contract](docs/design-contract.md), and [security model](SECURITY.md).

## Development

```sh
npm install
npm run check
npm run agentctl -- inspect --home ./test/fixtures/home
npm run agentctl -- agents list
npm run dev
```

The website is static HTML, CSS, and JavaScript deployed as Cloudflare Worker
static assets.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). By contributing, you agree to the
[Developer Certificate of Origin](https://developercertificate.org/) sign-off
described there and the project [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
