import {
  accessSync,
  constants,
  existsSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import {
  delimiter,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  expandHomePath,
  resolveAgentRoot,
} from "./root.mjs";
import {
  DEFAULT_INSTALLER_DOWNLOAD_TIMEOUT_MS,
  executeRemoteInstallerStep,
  findExecutable,
  removeApprovedPaths,
} from "./tools.mjs";
import { VERSION } from "./version.mjs";

export const SELF_PLAN_SCHEMA_VERSION = "agentctl.self-plan/v1alpha1";
export const SELF_RECEIPT_SCHEMA_VERSION =
  "agentctl.self-receipt/v1alpha1";

function selectedPath(value, fallback, home) {
  return resolve(expandHomePath(value ?? fallback, home));
}

export function resolveSelfPaths({
  home = homedir(),
  env = process.env,
} = {}) {
  const selectedHome = resolve(home);
  const binDirectory = selectedPath(
    env.AGENTCTL_INSTALL_DIR,
    join(selectedHome, ".local", "bin"),
    selectedHome,
  );
  const dataBase = env.XDG_DATA_HOME
    ? selectedPath(env.XDG_DATA_HOME, null, selectedHome)
    : join(selectedHome, ".local", "share");
  const libraryDirectory = selectedPath(
    env.AGENTCTL_LIB_DIR,
    join(dataBase, "agentctl"),
    selectedHome,
  );
  return {
    home: selectedHome,
    command: join(binDirectory, "agentctl"),
    binDirectory,
    libraryDirectory,
  };
}

function executableReady(command) {
  try {
    accessSync(command, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function commandRequirement(command, { home, env }) {
  const executable = findExecutable(command, { home, env });
  return {
    kind: "command",
    command,
    satisfied: Boolean(executable),
    detail: executable
      ? `${command} is available at ${executable.path}`
      : `${command} is not available on PATH`,
  };
}

function updatePreconditions(paths, { home, env }) {
  const requirements = ["bash", "curl", "tar", "node"].map((command) =>
    commandRequirement(command, { home, env }),
  );
  const checksum =
    findExecutable("shasum", { home, env }) ??
    findExecutable("sha256sum", { home, env });
  requirements.push({
    kind: "checksum",
    satisfied: Boolean(checksum),
    detail: checksum
      ? `checksum verifier is available at ${checksum.path}`
      : "shasum or sha256sum is required",
  });
  requirements.push({
    kind: "managed-install",
    satisfied: executableReady(paths.command),
    detail: executableReady(paths.command)
      ? `managed agentctl command exists at ${paths.command}`
      : `managed agentctl command was not found at ${paths.command}`,
  });
  return requirements;
}

function assertHomeBounded(path, home) {
  if (path === home || !path.startsWith(`${home}${sep}`)) {
    throw new Error(`Self lifecycle path is outside the selected home: ${path}`, {
      cause: { code: "E_SELF_PATH" },
    });
  }
}

function uninstallTargets(paths, { root, home, env }) {
  assertHomeBounded(paths.command, home);
  assertHomeBounded(paths.libraryDirectory, home);
  const canonicalRoot = resolveAgentRoot({ root, home, env });
  if (
    canonicalRoot === paths.libraryDirectory ||
    canonicalRoot.startsWith(`${paths.libraryDirectory}${sep}`)
  ) {
    throw new Error(
      `Refusing self uninstall because the library path contains the canonical root: ${canonicalRoot}`,
      { cause: { code: "E_SELF_PATH" } },
    );
  }
  return [
    relative(home, paths.command),
    relative(home, paths.libraryDirectory),
  ];
}

export function planSelfOperation({
  operation,
  root,
  home = homedir(),
  env = process.env,
} = {}) {
  if (!["update", "uninstall"].includes(operation)) {
    throw new Error(`Unsupported self operation: ${operation}`, {
      cause: { code: "E_SELF_OPERATION" },
    });
  }
  const paths = resolveSelfPaths({ home, env });
  let step;
  let preconditions;
  if (operation === "update") {
    step = {
      kind: "remote-installer",
      url: "https://agentctl.justrepl.com/install.sh",
      allowedHosts: ["agentctl.justrepl.com"],
      interpreter: "bash",
      args: [],
      pathPolicy: null,
      downloadTimeoutMs: DEFAULT_INSTALLER_DOWNLOAD_TIMEOUT_MS,
      display:
        "download https://agentctl.justrepl.com/install.sh, verify its origin, record its SHA-256, then run bash <downloaded-installer>",
    };
    preconditions = updatePreconditions(paths, {
      home: paths.home,
      env,
    });
  } else {
    const targets = uninstallTargets(paths, {
      root,
      home: paths.home,
      env,
    });
    step = {
      kind: "remove-paths",
      paths: targets,
      display: `remove ${targets.map((path) => `~/${path}`).join(" and ")}`,
    };
    preconditions = [
      {
        kind: "managed-install",
        satisfied:
          existsSync(paths.command) || existsSync(paths.libraryDirectory),
        detail:
          existsSync(paths.command) || existsSync(paths.libraryDirectory)
            ? "managed agentctl installation paths exist"
            : "managed agentctl installation paths were not found",
      },
    ];
  }
  return {
    schemaVersion: SELF_PLAN_SCHEMA_VERSION,
    agentctlVersion: VERSION,
    operation,
    currentVersion: VERSION,
    paths,
    canonicalRoot: resolveAgentRoot({
      root,
      home: paths.home,
      env,
    }),
    preservationPolicy:
      "preserve canonical root, agent configuration, and credentials",
    step,
    preconditions,
    requiresConfirmation: true,
  };
}

function assertPreconditions(plan) {
  const failed = plan.preconditions.filter(
    (precondition) => !precondition.satisfied,
  );
  if (failed.length > 0) {
    throw new Error(
      `Self lifecycle precondition failed: ${failed.map((item) => item.detail).join("; ")}`,
      { cause: { code: "E_SELF_PRECONDITION" } },
    );
  }
}

function verifyUpdatedVersion(command, env) {
  const result = spawnSync(command, ["version", "--json"], {
    encoding: "utf8",
    env,
    timeout: 5_000,
    shell: false,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `Updated agentctl could not be verified at ${command}.`,
      { cause: { code: "E_SELF_UNVERIFIED" } },
    );
  }
  try {
    const report = JSON.parse(result.stdout);
    if (!report.version) throw new Error("missing version");
    return report.version;
  } catch {
    throw new Error("Updated agentctl returned invalid version JSON.", {
      cause: { code: "E_SELF_UNVERIFIED" },
    });
  }
}

function compareAgentctlVersions(left, right) {
  const parse = (value) => {
    const match = String(value).match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    if (!match) {
      throw new Error(`Invalid agentctl version: ${value}`, {
        cause: { code: "E_SELF_UNVERIFIED" },
      });
    }
    return match.slice(1).map(Number);
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return Math.sign(a[index] - b[index]);
  }
  return 0;
}

function canonicalInstallerEnvironment(env) {
  const selected = { ...env };
  delete selected.AGENTCTL_REPOSITORY;
  delete selected.AGENTCTL_DOWNLOAD_BASE;
  delete selected.AGENTCTL_VERSION;
  delete selected.AGENTCTL_MIN_VERSION;
  return selected;
}

export async function executeSelfPlan(
  plan,
  {
    home = homedir(),
    env = process.env,
    stdout = process.stdout,
    stderr = process.stderr,
    fetchImpl = fetch,
    now = () => new Date().toISOString(),
  } = {},
) {
  if (plan.schemaVersion !== SELF_PLAN_SCHEMA_VERSION) {
    throw new Error("Unsupported or missing self plan schema.", {
      cause: { code: "E_SELF_PLAN" },
    });
  }
  assertPreconditions(plan);
  let execution;
  let installedVersion = null;
  if (plan.operation === "update") {
    execution = await executeRemoteInstallerStep(plan.step, {
      home,
      env: {
        ...canonicalInstallerEnvironment(env),
        HOME: resolve(home),
        AGENTCTL_MIN_VERSION: plan.currentVersion,
        PATH: [
          plan.paths.binDirectory,
          env.PATH ?? "",
        ].filter(Boolean).join(delimiter),
      },
      stdout,
      stderr,
      fetchImpl,
    });
    installedVersion = verifyUpdatedVersion(plan.paths.command, env);
    if (
      compareAgentctlVersions(installedVersion, plan.currentVersion) < 0
    ) {
      throw new Error(
        `Self update refused a version downgrade from ${plan.currentVersion} to ${installedVersion}.`,
        { cause: { code: "E_SELF_DOWNGRADE" } },
      );
    }
  } else {
    execution = removeApprovedPaths(plan.step, {
      home,
      stdout,
    });
    if (
      existsSync(plan.paths.command) ||
      existsSync(plan.paths.libraryDirectory)
    ) {
      throw new Error("agentctl installation paths remain after uninstall.", {
        cause: { code: "E_SELF_UNVERIFIED" },
      });
    }
  }
  return {
    schemaVersion: SELF_RECEIPT_SCHEMA_VERSION,
    agentctlVersion: VERSION,
    operation: plan.operation,
    beforeVersion: plan.currentVersion,
    afterVersion: installedVersion,
    preservationPolicy: plan.preservationPolicy,
    canonicalRoot: plan.canonicalRoot,
    execution,
    completedAt: now(),
  };
}
