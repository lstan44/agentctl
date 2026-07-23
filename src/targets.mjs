import { delimiter, join } from "node:path";
import { accessSync, constants } from "node:fs";

function executableOnPath(command, env) {
  const pathValue = env.PATH ?? "";
  const extensions =
    process.platform === "win32"
      ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")
      : [""];

  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      try {
        accessSync(join(directory, `${command}${extension}`), constants.X_OK);
        return true;
      } catch {
        // Continue searching without executing the target binary.
      }
    }
  }
  return false;
}

const definitions = [
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    root: ({ home }) => join(home, ".codex"),
    skillDirs: ["skills"],
    resourceDirs: {
      agents: ["agents"],
      commands: ["prompts", "commands"],
      rules: ["rules"],
    },
    guidanceFiles: ["AGENTS.md"],
    configFiles: ["config.toml", "mcp.json"],
  },
  {
    id: "claude",
    label: "Claude Code",
    command: "claude",
    root: ({ home }) => join(home, ".claude"),
    skillDirs: ["skills"],
    resourceDirs: {
      agents: ["agents"],
      commands: ["commands"],
      rules: ["rules"],
    },
    guidanceFiles: ["CLAUDE.md"],
    configFiles: ["settings.json", "settings.local.json", ".mcp.json"],
    homeConfigFiles: [".claude.json"],
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    command: "gemini",
    root: ({ home }) => join(home, ".gemini"),
    skillDirs: ["skills"],
    resourceDirs: {
      agents: ["agents"],
      commands: ["commands"],
      rules: ["rules"],
    },
    guidanceFiles: ["GEMINI.md"],
    configFiles: ["settings.json", "mcp.json"],
  },
  {
    id: "opencode",
    label: "OpenCode",
    command: "opencode",
    root: ({ home, env }) =>
      join(env.XDG_CONFIG_HOME || join(home, ".config"), "opencode"),
    skillDirs: ["skills"],
    resourceDirs: {
      agents: ["agents", "agent"],
      commands: ["commands", "command"],
      rules: ["rules"],
    },
    guidanceFiles: ["AGENTS.md"],
    configFiles: ["opencode.json", "opencode.jsonc", "config.json"],
  },
  {
    id: "cursor",
    label: "Cursor",
    command: "cursor",
    root: ({ home }) => join(home, ".cursor"),
    skillDirs: ["skills"],
    resourceDirs: {
      agents: ["agents"],
      commands: ["commands"],
      rules: ["rules"],
    },
    guidanceFiles: ["AGENTS.md"],
    configFiles: ["mcp.json", "settings.json"],
  },
];

export function getTargetDefinitions({ home, env = process.env } = {}) {
  return definitions.map((definition) => ({
    ...definition,
    rootPath: definition.root({ home, env }),
    executableAvailable: executableOnPath(definition.command, env),
  }));
}

export function targetIds() {
  return definitions.map((definition) => definition.id);
}
