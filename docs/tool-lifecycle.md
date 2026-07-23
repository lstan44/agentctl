# Agent tool lifecycle contract

## Purpose

`agentctl agents` provides one plan-first interface for discovering and managing
popular agentic command-line tools while preserving each provider's native
installation semantics.

It is provider-agnostic at the control-plane layer, not provider-blind. Every
tool retains its own official package, update command, supported channels, and
configuration ownership.

## Canonical and machine truth

The canonical root contains version-controlled desired state:

```text
~/.agentctl/
├── agentctl.yaml
├── catalog/
│   ├── tools.json
│   └── guidance/global.md
├── targets/
└── .agentctl/
    └── state/        # ignored machine observations and receipts
```

`catalog/tools.json` answers “what should this environment have?” The ignored
state answers “what did this machine last verify?” `agents status` independently
observes what currently resolves on the selected `PATH`.

## Supported tools and official contracts

| Tool | Default channel | Other channels | Official source |
| --- | --- | --- | --- |
| OpenAI Codex CLI | npm `@openai/codex@latest` | Homebrew cask | [Codex CLI documentation](https://developers.openai.com/codex/cli/) |
| Claude Code | Anthropic native `latest` | npm, Homebrew cask | [Claude Code installation](https://code.claude.com/docs/en/installation) |
| OpenCode | npm `opencode-ai@latest` | Homebrew formula, native | [OpenCode documentation](https://opencode.ai/docs/) |
| Gemini CLI | npm `@google/gemini-cli@latest` | Homebrew formula | [Gemini CLI repository](https://github.com/google-gemini/gemini-cli) |
| GitHub Copilot CLI | npm `@github/copilot@latest` | Homebrew cask | [Copilot CLI getting started](https://docs.github.com/en/copilot/how-tos/copilot-cli/cli-getting-started) |
| OpenClaw | npm `openclaw@latest` | — | [OpenClaw installation](https://docs.openclaw.ai/install) |
| Hermes Agent | Nous Research native installer | — | [Hermes installation](https://hermes-agent.nousresearch.com/docs/getting-started/installation) |

The default is selected for cross-platform consistency and integrity metadata.
Claude's official native installer is the default because Anthropic recommends
it and the installer validates its downloaded platform binary. OpenCode's
native bootstrap remains opt-in; its npm package is the default. OpenClaw's npm
package publishes integrity metadata and enforces its exact supported Node
ranges. Hermes is distributed as a managed source checkout, so its reviewed
native installer is the only catalog channel.

Minimum Node.js versions are checked before confirmed npm operations when an
upstream package requires a version newer than agentctl itself.

## Commands

```sh
agentctl agents list
agentctl agents status
agentctl agents status claude --json

agentctl agents install codex --dry-run
agentctl agents install codex --yes
agentctl agents install claude --channel npm --yes
agentctl agents install --all --dry-run

agentctl agents update opencode --yes
agentctl agents update --all --dry-run

agentctl agents uninstall claude --yes

agentctl self update --dry-run
agentctl self update --yes
agentctl self uninstall --yes
```

Bulk uninstall is deliberately unsupported. Destructive scope must remain one
named tool at a time. `install --all` installs missing tools and plans an update
for already-installed tools, making the complete latest catalog explicit in
desired truth.

## Plan and confirmation semantics

Every mutation:

1. identifies the tool and current executable;
2. infers a known channel from an agentctl receipt or executable real path;
3. resolves one static lifecycle recipe;
4. prints the desired-state change, exact command or bounded filesystem paths,
   configuration policy, and local preconditions;
5. exits without mutation unless `--yes` is present;
6. applies desired truth, performs the external operation, probes the installed
   version, and records a machine receipt only after verification.

`--dry-run` always exits without changing desired or machine state. A plan with
an unsatisfied precondition can be inspected but cannot be executed. A
confirmed batch preflights every plan before changing its first tool, so a
known failure cannot leave a predictable partial batch.

If an external operation fails after desired truth changes, agentctl leaves that
truth intact and writes no success receipt. The next status report exposes the
result as drift. This makes interrupted provisioning resumable and auditable.

## Channel inference

A managed-state receipt takes precedence only while its recorded executable
still resolves to the currently observed command. Stale receipts cannot
override present ownership. Otherwise:

- executable real paths containing Homebrew `Cellar` or `Caskroom` imply
  `brew`;
- executable real paths under `node_modules` imply `npm`;
- Claude's official version directory implies `native`;
- OpenCode's `~/.opencode/bin` implies `native`;
- Hermes' `~/.local/bin/hermes` or `~/.hermes` path implies `native`;
- anything else remains `unknown`.

An update may use an official self-update fallback when the tool supports one,
including `gemini update` and `copilot update`. An uninstall with unknown
ownership fails closed and requires an explicit `--channel`; agentctl does not
guess which package manager owns a binary.

## Native installer boundary

For supported native installs, agentctl:

- downloads the official HTTPS URL itself;
- validates both initial and final redirect origins against a static allowlist;
- rejects empty, oversized, timed-out, or non-script responses;
- stores the script in a private temporary directory;
- prints and records its SHA-256;
- executes it with a fixed interpreter and static arguments;
- removes the temporary directory afterward.

The recorded SHA-256 is evidence of what ran, not an independent authenticity
signature. OpenCode is invoked with `--no-modify-path`.

## Configuration-preserving uninstall

Uninstall means “remove the selected CLI distribution,” not “erase the user's
agent identity.”

- npm and Homebrew remove only the registered package.
- Claude native removes `~/.local/bin/claude` and
  `~/.local/share/claude`; `~/.claude` is preserved.
- OpenCode native invokes its official uninstall with `--keep-config` and
  `--keep-data`.
- agentctl never deletes arbitrary paths supplied by a user. Native removal
  paths are static and must resolve beneath the selected home.

If another installation still resolves after uninstall, verification fails and
agentctl reports that another copy may remain. It does not broaden removal
scope.

### OpenClaw

OpenClaw installation uses npm without onboarding or daemon creation. Update
delegates to `openclaw update --yes`, which detects its owning install,
stages/verifies package updates, coordinates a managed Gateway, runs doctor, and
verifies restart health. Uninstall first runs OpenClaw's service-only,
non-interactive uninstaller, then removes the npm package. State, credentials,
plugins, and workspaces under `~/.openclaw` are not selected.

OpenClaw's published engine range is disjoint:
`>=22.22.3 <23`, `>=24.15.0 <25`, or `>=25.9.0`. agentctl checks this exact
constraint before mutation instead of treating every numerically newer major as
compatible.

### Hermes Agent

Hermes installation downloads the Nous Research installer from its official
HTTPS endpoint and permits only the documented GitHub raw redirect. agentctl
passes `--skip-setup --skip-browser`, blocks root execution, requires Git and
the platform archive prerequisites, and prepends `~/.local/bin` only inside the
installer process so the installer does not edit shell profiles.

Hermes update delegates to `hermes update --yes`, retaining its default
pre-update state snapshot, syntax validation, rollback, dependency refresh, and
Gateway restart behavior. `hermes uninstall --yes` removes the agent while
preserving `~/.hermes` configuration, auth, skills, sessions, and logs.

## agentctl self lifecycle

The control plane is intentionally outside the agent catalog. `agentctl self
update` downloads the canonical public installer with the same bounded
allowlist used for native tool bootstraps. The public installer then downloads
the versioned GitHub release archive and verifies its published SHA-256 before
atomic activation. A minimum-version guard rejects downgrades, and the newly
installed `agentctl version --json` must succeed before a receipt is emitted.
Ambient release-source and version overrides are stripped from the self-update
child environment; installer destination overrides remain available.

`agentctl self uninstall` removes the managed `~/.local/bin/agentctl` command
and `~/.local/share/agentctl` version library (or explicit installer override
paths). Targets must remain under the selected home, and no library target may
contain the canonical root. The canonical repository, agent configuration, and
credentials survive.

## Adding another agentic tool

A catalog addition must provide:

- unique tool ID, command, version query, and official primary source;
- one reviewed default channel;
- exact install, update, and uninstall recipes;
- package/runtime prerequisites;
- channel-detection evidence;
- configuration and data ownership boundaries;
- success, failure, untrusted-origin, and preservation tests;
- updated JSON schema examples and public documentation.

Arbitrary shell strings, user-controlled interpolation, `sudo`, implicit shell
startup edits, and undocumented purge behavior are out of scope.
