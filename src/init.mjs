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
import { basename, dirname, join, resolve } from "node:path";

const files = {
  "agentctl.yaml": `apiVersion: agentctl.justrepl.com/v1alpha1
kind: AgentEnvironment
metadata:
  name: personal
spec:
  guidance:
    - catalog/guidance/global.md
  targets:
    codex:
      enabled: true
    claude:
      enabled: true
`,
  ".gitignore": `.agentctl/build/
.agentctl/state/
*.local.yaml
`,
  "README.md": `# Agent environment

This repository is the canonical source for an Agent Environment as Code setup.

Validate and inspect with:

\`\`\`sh
agentctl inspect
\`\`\`

Target-native rendering and reconciliation arrive in a later agentctl release.
`,
  "catalog/guidance/global.md": `# Shared agent guidance

Replace this text with principles that should apply across supported agents.
Keep target-specific behavior in explicit target overlays.
`,
  "catalog/skills/.gitkeep": "",
  "targets/codex/.gitkeep": "",
  "targets/claude/.gitkeep": "",
};

export function initPlan(directory) {
  const target = resolve(directory || "agent-environment");
  return {
    schemaVersion: "agentctl.init-plan/v1alpha1",
    mode: "write-explicit",
    target,
    files: Object.keys(files).sort(),
  };
}

export function initializeEnvironment(directory, { dryRun = false } = {}) {
  const plan = initPlan(directory);
  if (dryRun) return { ...plan, applied: false };

  if (existsSync(plan.target)) {
    const entries = readdirSync(plan.target);
    if (entries.length > 0) {
      throw new Error(
        `Refusing to initialize non-empty directory: ${plan.target}`,
        { cause: { code: "E_NOT_EMPTY" } },
      );
    }
  }

  const parent = dirname(plan.target);
  mkdirSync(parent, { recursive: true });
  const stage = mkdtempSync(
    join(parent, `.${basename(plan.target)}.agentctl-stage-`),
  );

  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const destination = join(stage, relativePath);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, content, { encoding: "utf8", flag: "wx" });
    }

    if (existsSync(plan.target)) rmdirSync(plan.target);
    renameSync(stage, plan.target);
  } catch (error) {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
    throw error;
  }

  return {
    ...plan,
    applied: true,
    manifest: readFileSync(join(plan.target, "agentctl.yaml"), "utf8"),
  };
}

export const initFiles = files;
