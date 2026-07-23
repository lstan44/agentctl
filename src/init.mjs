import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  isInitializedRoot,
  resolveAgentRoot,
} from "./root.mjs";
import { defaultDesiredTools } from "./tool-state.mjs";

function scaffoldFiles() {
  return {
    "agentctl.yaml": `apiVersion: agentctl.justrepl.com/v1alpha1
kind: AgentEnvironment
metadata:
  name: personal
spec:
  guidance:
    - catalog/guidance/global.md
  tools:
    source: catalog/tools.json
  targets:
    codex:
      enabled: true
    claude:
      enabled: true
    opencode:
      enabled: true
    gemini:
      enabled: true
    copilot:
      enabled: true
    openclaw:
      enabled: true
    hermes:
      enabled: true
`,
    ".gitignore": `.agentctl/build/
.agentctl/state/
*.local.yaml
`,
    "README.md": `# Agent environment

This Git repository is the canonical source for your Agent Environment as Code.
Commit it, push it to a private or public GitHub repository, and use it to carry
the same declared setup across machines.

Inspect the canonical configuration without running an agent:

\`\`\`sh
agentctl inspect
agentctl agents list
\`\`\`

Plan lifecycle changes before applying them:

\`\`\`sh
agentctl agents install codex --dry-run
agentctl agents install codex --yes
\`\`\`

\`catalog/tools.json\` is version-controlled desired state. Machine observations
and operation receipts live under ignored \`.agentctl/state/\`; credentials and
agent-owned configuration remain outside this repository.
`,
    "catalog/tools.json": `${JSON.stringify(defaultDesiredTools(), null, 2)}\n`,
    "catalog/guidance/global.md": `# Shared agent guidance

Replace this text with principles that should apply across supported agents.
Keep target-specific behavior in explicit target overlays.
`,
    "catalog/skills/.gitkeep": "",
    "targets/codex/.gitkeep": "",
    "targets/claude/.gitkeep": "",
    "targets/opencode/.gitkeep": "",
    "targets/gemini/.gitkeep": "",
    "targets/copilot/.gitkeep": "",
    "targets/openclaw/.gitkeep": "",
    "targets/hermes/.gitkeep": "",
  };
}

function gitAvailable(env) {
  const result = spawnSync("git", ["--version"], {
    encoding: "utf8",
    env,
    shell: false,
  });
  return !result.error && result.status === 0;
}

function initializeGit(target, env) {
  if (!gitAvailable(env)) {
    return {
      initialized: false,
      warning:
        "Git was not found. Install Git, then run `git init -b main` in the canonical root.",
    };
  }
  const preferred = spawnSync("git", ["init", "-b", "main", target], {
    encoding: "utf8",
    env,
    shell: false,
  });
  if (!preferred.error && preferred.status === 0) {
    return { initialized: true, warning: null };
  }
  const fallback = spawnSync("git", ["init", target], {
    encoding: "utf8",
    env,
    shell: false,
  });
  if (fallback.error || fallback.status !== 0) {
    const detail =
      fallback.error?.message ??
      fallback.stderr?.trim() ??
      "git init failed";
    return {
      initialized: false,
      warning: `Canonical root was created, but Git initialization failed: ${detail}`,
    };
  }
  return { initialized: true, warning: null };
}

function nextSteps(target, { gitInitialized }) {
  return [
    `cd ${JSON.stringify(target)}`,
    ...(gitInitialized ? [] : ["git init -b main"]),
    "git add .",
    'git commit -m "Initialize canonical agent environment"',
    "git remote add origin git@github.com:YOUR-USER/YOUR-AGENT-ENV.git",
    "git push -u origin main",
  ];
}

export function initPlan(
  directory,
  {
    home = homedir(),
    env = process.env,
    git = true,
  } = {},
) {
  const target = resolveAgentRoot({
    root: directory,
    home,
    env,
  });
  return {
    schemaVersion: "agentctl.init-plan/v1alpha1",
    mode: "write-explicit",
    target,
    initializeGit: git,
    files: Object.keys(scaffoldFiles()).sort(),
  };
}

export function initializeEnvironment(
  directory,
  {
    dryRun = false,
    git = true,
    home = homedir(),
    env = process.env,
  } = {},
) {
  const plan = initPlan(directory, { home, env, git });
  if (dryRun) {
    return {
      ...plan,
      applied: false,
      idempotent: false,
      gitInitialized: false,
      nextSteps: nextSteps(plan.target, { gitInitialized: false }),
    };
  }

  if (isInitializedRoot(plan.target)) {
    const alreadyGit = existsSync(join(plan.target, ".git"));
    const gitResult =
      !alreadyGit && git
        ? initializeGit(plan.target, env)
        : { initialized: alreadyGit, warning: null };
    return {
      ...plan,
      applied: false,
      idempotent: true,
      gitInitialized: gitResult.initialized,
      warning: gitResult.warning,
      manifest: readFileSync(join(plan.target, "agentctl.yaml"), "utf8"),
      nextSteps: nextSteps(plan.target, {
        gitInitialized: gitResult.initialized,
      }),
    };
  }

  if (existsSync(plan.target) && readdirSync(plan.target).length > 0) {
    throw new Error(
      `Refusing to initialize unrelated non-empty directory: ${plan.target}`,
      { cause: { code: "E_NOT_EMPTY" } },
    );
  }

  const parent = dirname(plan.target);
  mkdirSync(parent, { recursive: true });
  const stage = mkdtempSync(
    join(parent, `.${basename(plan.target)}.agentctl-stage-`),
  );

  try {
    for (const [relativePath, content] of Object.entries(scaffoldFiles())) {
      const destination = join(stage, relativePath);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, content, {
        encoding: "utf8",
        flag: "wx",
      });
    }

    if (existsSync(plan.target)) rmdirSync(plan.target);
    renameSync(stage, plan.target);
  } catch (error) {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
    throw error;
  }

  const gitResult = git
    ? initializeGit(plan.target, env)
    : { initialized: false, warning: null };

  return {
    ...plan,
    applied: true,
    idempotent: false,
    gitInitialized: gitResult.initialized,
    warning: gitResult.warning,
    manifest: readFileSync(join(plan.target, "agentctl.yaml"), "utf8"),
    nextSteps: nextSteps(plan.target, {
      gitInitialized: gitResult.initialized,
    }),
  };
}

export const initFiles = scaffoldFiles();
