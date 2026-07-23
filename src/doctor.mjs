import { accessSync, constants, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { getTargetDefinitions } from "./targets.mjs";
import { isInitializedRoot, resolveAgentRoot } from "./root.mjs";
import { VERSION } from "./version.mjs";

function commandAvailable(command, env) {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    stdio: "ignore",
    timeout: 2_000,
    env,
    shell: false,
  });
  return !result.error && result.status === 0;
}

export function runDoctor({
  home = homedir(),
  env = process.env,
  platform = process.platform,
  nodeVersion = process.versions.node,
} = {}) {
  const selectedHome = resolve(home);
  const checks = [];

  const nodeMajor = Number(nodeVersion.split(".")[0]);
  checks.push({
    id: "node-version",
    status: nodeMajor >= 20 ? "pass" : "fail",
    detail: `Node.js ${nodeVersion}; agentctl requires 20 or newer.`,
    recovery:
      nodeMajor >= 20 ? null : "Install an active Node.js LTS release and retry.",
  });

  checks.push({
    id: "platform",
    status: ["darwin", "linux"].includes(platform) ? "pass" : "warn",
    detail: `${platform}; v0.2 is release-tested on macOS and Linux.`,
    recovery: ["darwin", "linux"].includes(platform)
      ? null
      : "Use --json and report compatibility findings on GitHub.",
  });

  let homeStatus = "pass";
  let homeRecovery = null;
  try {
    accessSync(selectedHome, constants.R_OK);
  } catch {
    homeStatus = "fail";
    homeRecovery = "Choose a readable home with --home PATH.";
  }
  checks.push({
    id: "home-readable",
    status: homeStatus,
    detail: `${selectedHome} is ${homeStatus === "pass" ? "readable" : "not readable"}.`,
    recovery: homeRecovery,
  });

  const gitAvailable = commandAvailable("git", env);
  checks.push({
    id: "git",
    status: gitAvailable ? "pass" : "warn",
    detail: gitAvailable
      ? "Git is available for version-controlled environment sources."
      : "Git was not found on PATH.",
    recovery: gitAvailable
      ? null
      : "Install Git before initializing a canonical repository.",
  });

  const root = resolveAgentRoot({ home: selectedHome, env });
  const rootInitialized = isInitializedRoot(root);
  checks.push({
    id: "canonical-root",
    status: rootInitialized ? "pass" : "warn",
    detail: rootInitialized
      ? `Canonical root is initialized at ${root}.`
      : `Canonical root is not initialized at ${root}.`,
    recovery: rootInitialized ? null : "Run `agentctl init` to create it.",
  });

  const targets = getTargetDefinitions({ home: selectedHome, env }).map(
    (target) => ({
      id: target.id,
      label: target.label,
      rootExists: existsSync(target.rootPath),
      executableAvailable: target.executableAvailable,
      detected: existsSync(target.rootPath) || target.executableAvailable,
    }),
  );

  return {
    schemaVersion: "agentctl.doctor/v1alpha1",
    agentctlVersion: VERSION,
    mode: "read-only",
    root,
    ok: checks.every((check) => check.status !== "fail"),
    checks,
    targets,
  };
}
