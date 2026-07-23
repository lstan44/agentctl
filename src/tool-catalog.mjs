const npmChannel = (packageName, { minimumNode = null } = {}) => ({
  id: "npm",
  label: "npm global",
  packageName,
  minimumNode,
  install: ["npm", "install", "--global", `${packageName}@latest`],
  update: ["npm", "install", "--global", `${packageName}@latest`],
  uninstall: ["npm", "uninstall", "--global", packageName],
});

const brewChannel = ({
  installName,
  packageName,
  cask = false,
}) => ({
  id: "brew",
  label: cask ? "Homebrew cask" : "Homebrew formula",
  packageName,
  cask,
  install: [
    "brew",
    "install",
    ...(cask ? ["--cask"] : []),
    installName,
  ],
  update: [
    "brew",
    "upgrade",
    ...(cask ? ["--cask"] : []),
    packageName,
  ],
  uninstall: [
    "brew",
    "uninstall",
    ...(cask ? ["--cask"] : []),
    packageName,
  ],
});

export const TOOL_CATALOG_SCHEMA_VERSION = "agentctl.tool-catalog/v1alpha1";

export const toolCatalog = [
  {
    id: "codex",
    label: "OpenAI Codex CLI",
    command: "codex",
    versionArgs: ["--version"],
    defaultChannel: "npm",
    sourceUrl: "https://developers.openai.com/codex/cli/",
    channels: [
      npmChannel("@openai/codex"),
      brewChannel({
        installName: "codex",
        packageName: "codex",
        cask: true,
      }),
    ],
    fallbackUpdate: ["codex", "update"],
    configurationPolicy: "preserve",
  },
  {
    id: "claude",
    label: "Claude Code",
    command: "claude",
    versionArgs: ["--version"],
    defaultChannel: "native",
    sourceUrl: "https://code.claude.com/docs/en/installation",
    channels: [
      {
        id: "native",
        label: "Anthropic native installer",
        installerUrl: "https://claude.ai/install.sh",
        installerHosts: ["claude.ai"],
        installerArgs: ["latest"],
        update: ["claude", "update"],
        uninstallPaths: [
          ".local/bin/claude",
          ".local/share/claude",
        ],
      },
      npmChannel("@anthropic-ai/claude-code", { minimumNode: 22 }),
      brewChannel({
        installName: "claude-code@latest",
        packageName: "claude-code@latest",
        cask: true,
      }),
    ],
    fallbackUpdate: ["claude", "update"],
    configurationPolicy: "preserve",
  },
  {
    id: "opencode",
    label: "OpenCode",
    command: "opencode",
    versionArgs: ["--version"],
    defaultChannel: "npm",
    sourceUrl: "https://opencode.ai/docs/",
    channels: [
      npmChannel("opencode-ai"),
      brewChannel({
        installName: "anomalyco/tap/opencode",
        packageName: "opencode",
      }),
      {
        id: "native",
        label: "OpenCode native installer",
        installerUrl: "https://opencode.ai/install",
        installerHosts: ["opencode.ai"],
        installerArgs: ["--no-modify-path"],
        update: ["opencode", "upgrade", "--method", "curl"],
        uninstall: [
          "opencode",
          "uninstall",
          "--keep-config",
          "--keep-data",
          "--force",
        ],
      },
    ],
    fallbackUpdate: ["opencode", "upgrade"],
    configurationPolicy: "preserve",
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    command: "gemini",
    versionArgs: ["--version"],
    defaultChannel: "npm",
    sourceUrl: "https://github.com/google-gemini/gemini-cli",
    channels: [
      npmChannel("@google/gemini-cli", { minimumNode: 20 }),
      brewChannel({
        installName: "gemini-cli",
        packageName: "gemini-cli",
      }),
    ],
    fallbackUpdate: ["gemini", "update"],
    configurationPolicy: "preserve",
  },
  {
    id: "copilot",
    label: "GitHub Copilot CLI",
    command: "copilot",
    versionArgs: ["--version"],
    defaultChannel: "npm",
    sourceUrl:
      "https://docs.github.com/en/copilot/how-tos/copilot-cli/cli-getting-started",
    channels: [
      npmChannel("@github/copilot", { minimumNode: 22 }),
      brewChannel({
        installName: "copilot-cli",
        packageName: "copilot-cli",
        cask: true,
      }),
    ],
    fallbackUpdate: ["copilot", "update"],
    configurationPolicy: "preserve",
  },
  {
    id: "openclaw",
    label: "OpenClaw",
    command: "openclaw",
    versionArgs: ["--version"],
    defaultChannel: "npm",
    sourceUrl: "https://docs.openclaw.ai/install",
    channels: [
      {
        ...npmChannel("openclaw"),
        minimumNode: null,
        nodeRanges: [
          { minimum: "22.22.3", maximumExclusive: "23.0.0" },
          { minimum: "24.15.0", maximumExclusive: "25.0.0" },
          { minimum: "25.9.0" },
        ],
        enforceNodeOnUninstall: true,
        update: ["openclaw", "update", "--yes"],
        beforeUninstall: [
          "openclaw",
          "uninstall",
          "--service",
          "--yes",
          "--non-interactive",
        ],
        timeoutMs: 15 * 60_000,
      },
    ],
    fallbackUpdate: ["openclaw", "update", "--yes"],
    configurationPolicy: "preserve",
  },
  {
    id: "hermes",
    label: "Hermes Agent",
    command: "hermes",
    versionArgs: ["version"],
    defaultChannel: "native",
    sourceUrl:
      "https://hermes-agent.nousresearch.com/docs/getting-started/installation",
    channels: [
      {
        id: "native",
        label: "Nous Research native installer",
        installerUrl: "https://hermes-agent.nousresearch.com/install.sh",
        installerHosts: [
          "hermes-agent.nousresearch.com",
          "raw.githubusercontent.com",
        ],
        installerArgs: ["--skip-setup", "--skip-browser"],
        installerPathPolicy: "prepend-home-local-bin",
        requiredCommandsByOperation: {
          install: ["git", "curl", "tar"],
          update: ["git"],
        },
        platformRequiredCommandsByOperation: {
          install: {
            linux: ["xz"],
          },
        },
        disallowRootOperations: ["install"],
        timeoutMs: 30 * 60_000,
        update: ["hermes", "update", "--yes"],
        uninstall: ["hermes", "uninstall", "--yes"],
      },
    ],
    fallbackUpdate: ["hermes", "update", "--yes"],
    configurationPolicy: "preserve",
  },
];

export function getTool(toolId) {
  return toolCatalog.find((tool) => tool.id === toolId) ?? null;
}

export function getToolChannel(tool, channelId) {
  return tool.channels.find((channel) => channel.id === channelId) ?? null;
}

export function publicToolCatalog() {
  return {
    schemaVersion: TOOL_CATALOG_SCHEMA_VERSION,
    tools: toolCatalog.map((tool) => ({
      id: tool.id,
      label: tool.label,
      command: tool.command,
      defaultChannel: tool.defaultChannel,
      channels: tool.channels.map((channel) => ({
        id: channel.id,
        label: channel.label,
      })),
      sourceUrl: tool.sourceUrl,
      configurationPolicy: tool.configurationPolicy,
    })),
  };
}
