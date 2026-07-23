import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import {
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  getTool,
  getToolChannel,
  publicToolCatalog,
  toolCatalog,
} from "./tool-catalog.mjs";
import { isInitializedRoot, resolveAgentRoot } from "./root.mjs";
import {
  readDesiredTools,
  readToolState,
  recordToolState,
  removeToolState,
  updateDesiredTool,
} from "./tool-state.mjs";
import { VERSION } from "./version.mjs";

export const TOOL_STATUS_SCHEMA_VERSION = "agentctl.tool-status/v1alpha1";
export const TOOL_PLAN_SCHEMA_VERSION = "agentctl.tool-plan/v1alpha1";
export const TOOL_RECEIPT_SCHEMA_VERSION = "agentctl.tool-receipt/v1alpha1";

const MAX_INSTALLER_BYTES = 1024 * 1024;
export const DEFAULT_INSTALLER_DOWNLOAD_TIMEOUT_MS = 30_000;

function executableCandidates(command, { env, home }) {
  const fromPath = (env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, command));
  return [
    ...fromPath,
    join(home, ".local", "bin", command),
    join(home, ".opencode", "bin", command),
  ];
}

export function findExecutable(
  command,
  { env = process.env, home = homedir() } = {},
) {
  const seen = new Set();
  for (const candidate of executableCandidates(command, {
    env,
    home: resolve(home),
  })) {
    const selected = resolve(candidate);
    if (seen.has(selected)) continue;
    seen.add(selected);
    try {
      accessSync(selected, constants.X_OK);
      const realPath = realpathSync(selected);
      return { path: selected, realPath };
    } catch {
      // Keep searching. Broken links and non-executable files are not installed tools.
    }
  }
  return null;
}

function detectChannel(tool, executable, stateRecord, home) {
  let stateMatchesExecutable = false;
  if (stateRecord?.executablePath && executable) {
    const recordedPath = resolve(stateRecord.executablePath);
    stateMatchesExecutable = recordedPath === executable.path;
    if (!stateMatchesExecutable) {
      try {
        stateMatchesExecutable =
          realpathSync(recordedPath) === executable.realPath;
      } catch {
        stateMatchesExecutable = false;
      }
    }
  }
  if (
    stateMatchesExecutable &&
    stateRecord?.channel &&
    getToolChannel(tool, stateRecord.channel)
  ) {
    return {
      channel: stateRecord.channel,
      source: "agentctl-state",
      stateMatchesExecutable,
    };
  }
  if (!executable) {
    return { channel: null, source: null, stateMatchesExecutable: false };
  }
  const realPath = executable.realPath;
  if (realPath.includes(`${sep}Caskroom${sep}`)) {
    return {
      channel: "brew",
      source: "executable-path",
      stateMatchesExecutable,
    };
  }
  if (realPath.includes(`${sep}Cellar${sep}`)) {
    return {
      channel: "brew",
      source: "executable-path",
      stateMatchesExecutable,
    };
  }
  if (realPath.includes(`${sep}node_modules${sep}`)) {
    return {
      channel: "npm",
      source: "executable-path",
      stateMatchesExecutable,
    };
  }
  if (
    tool.id === "claude" &&
    realPath.includes(`${sep}.local${sep}share${sep}claude${sep}versions${sep}`)
  ) {
    return {
      channel: "native",
      source: "executable-path",
      stateMatchesExecutable,
    };
  }
  if (
    tool.id === "opencode" &&
    realPath.includes(`${sep}.opencode${sep}bin${sep}`)
  ) {
    return {
      channel: "native",
      source: "executable-path",
      stateMatchesExecutable,
    };
  }
  if (
    tool.id === "hermes" &&
    (
      realPath.includes(`${sep}.hermes${sep}`) ||
      executable.path === join(resolve(home), ".local", "bin", "hermes")
    )
  ) {
    return {
      channel: "native",
      source: "executable-path",
      stateMatchesExecutable,
    };
  }
  return {
    channel: null,
    source: "unknown",
    stateMatchesExecutable,
  };
}

function readVersion(tool, executable, { env }) {
  if (!executable) return { version: null, error: null };
  const result = spawnSync(executable.path, tool.versionArgs, {
    encoding: "utf8",
    env,
    timeout: 5_000,
    shell: false,
  });
  if (result.error || result.status !== 0) {
    return {
      version: null,
      error:
        result.error?.message ??
        (result.stderr || result.stdout || "version command failed").trim(),
    };
  }
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  const match = output.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/);
  return {
    version: match?.[0] ?? output.split(/\r?\n/)[0] ?? null,
    error: null,
  };
}

function driftFor({ desired, installed }) {
  if (desired?.enabled && !installed) return "missing";
  if (desired?.enabled && installed) return "aligned";
  if (!desired?.enabled && installed) return "unmanaged";
  return "aligned";
}

export function inspectAgentTools({
  root,
  home = homedir(),
  env = process.env,
  toolIds,
} = {}) {
  const selectedHome = resolve(home);
  const selectedRoot = resolveAgentRoot({ root, home: selectedHome, env });
  const desired = readDesiredTools(selectedRoot);
  const state = readToolState(selectedRoot);
  const selectedTools = toolIds?.length
    ? toolIds.map((toolId) => {
        const tool = getTool(toolId);
        if (!tool) {
          throw new Error(`Unknown agent tool: ${toolId}`, {
            cause: { code: "E_TOOL" },
          });
        }
        return tool;
      })
    : toolCatalog;

  const tools = selectedTools.map((tool) => {
    const executable = findExecutable(tool.command, {
      env,
      home: selectedHome,
    });
    const stateRecord = state.tools[tool.id] ?? null;
    const detectedChannel = detectChannel(
      tool,
      executable,
      stateRecord,
      selectedHome,
    );
    const version = readVersion(tool, executable, { env });
    const desiredTool = desired.tools[tool.id] ?? {
      enabled: false,
      channel: tool.defaultChannel,
      version: "latest",
    };
    return {
      id: tool.id,
      label: tool.label,
      command: tool.command,
      installed: Boolean(executable),
      version: version.version,
      versionError: version.error,
      executablePath: executable?.path ?? null,
      realPath: executable?.realPath ?? null,
      channel: detectedChannel.channel,
      channelSource: detectedChannel.source,
      managedByAgentctl: Boolean(
        stateRecord?.managedByAgentctl &&
        detectedChannel.stateMatchesExecutable,
      ),
      desired: desiredTool,
      drift: driftFor({
        desired: desiredTool,
        installed: Boolean(executable),
      }),
      sourceUrl: tool.sourceUrl,
    };
  });

  return {
    schemaVersion: TOOL_STATUS_SCHEMA_VERSION,
    agentctlVersion: VERSION,
    mode: "version-probe",
    root: selectedRoot,
    summary: {
      catalogTools: tools.length,
      installed: tools.filter((tool) => tool.installed).length,
      desired: tools.filter((tool) => tool.desired.enabled).length,
      drifted: tools.filter((tool) => tool.drift !== "aligned").length,
    },
    tools,
  };
}

function shellDisplay(parts) {
  return parts
    .map((part) =>
      /^[A-Za-z0-9_./:@+-]+$/.test(part)
        ? part
        : `'${part.replaceAll("'", "'\\''")}'`,
    )
    .join(" ");
}

function selectedChannelFor({
  operation,
  tool,
  status,
  channelId,
}) {
  if (channelId) return channelId;
  if (operation === "install") return tool.defaultChannel;
  return status.channel;
}

function replaceToolExecutable(command, tool, status) {
  if (
    command?.[0] === tool.command &&
    status.executablePath
  ) {
    return [status.executablePath, ...command.slice(1)];
  }
  return command;
}

function replaceOwningPackageManager(command, status) {
  if (command?.[0] !== "npm" || !status.executablePath) return command;
  const candidate = join(dirname(status.executablePath), "npm");
  try {
    accessSync(candidate, constants.X_OK);
    return [candidate, ...command.slice(1)];
  } catch {
    return command;
  }
}

function commandPrecondition(command, { env, home }) {
  let executable;
  if (isAbsolute(command)) {
    try {
      accessSync(command, constants.X_OK);
      executable = { path: command, realPath: realpathSync(command) };
    } catch {
      executable = null;
    }
  } else {
    executable = findExecutable(command, { env, home });
  }
  return {
    kind: "command",
    command,
    satisfied: Boolean(executable),
    detail: executable
      ? `${command} is available at ${executable.path}`
      : `${command} is not available on PATH`,
  };
}

function compareVersions(left, right) {
  const a = String(left).replace(/^v/, "").split(/[.-]/).slice(0, 3).map(Number);
  const b = String(right).replace(/^v/, "").split(/[.-]/).slice(0, 3).map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function nodeRangeSatisfied(version, range) {
  return (
    compareVersions(version, range.minimum) >= 0 &&
    (
      !range.maximumExclusive ||
      compareVersions(version, range.maximumExclusive) < 0
    )
  );
}

function nodeRangeLabel(ranges) {
  return ranges
    .map((range) =>
      range.maximumExclusive
        ? `>=${range.minimum} <${range.maximumExclusive}`
        : `>=${range.minimum}`,
    )
    .join(" or ");
}

function planPreconditions(
  channel,
  step,
  { env, home, root, nodeVersion, platform, uid, operation },
) {
  const preconditions = [
    {
      kind: "canonical-root",
      satisfied: isInitializedRoot(root),
      detail: isInitializedRoot(root)
        ? `canonical root is initialized at ${root}`
        : `canonical root is not initialized at ${root}; run agentctl init`,
    },
  ];
  if (step.kind === "remove-paths") return preconditions;
  const stepCommands =
    step.kind === "command"
      ? [step.command[0]]
      : step.kind === "command-sequence"
        ? step.commands.map((command) => command[0])
        : [step.interpreter];
  const commands = [
    ...stepCommands,
    ...(channel?.requiredCommands ?? []),
    ...(channel?.requiredCommandsByOperation?.[operation] ?? []),
    ...(channel?.platformRequiredCommands?.[platform] ?? []),
    ...(
      channel?.platformRequiredCommandsByOperation?.[operation]?.[platform] ??
      []
    ),
  ];
  for (const command of [...new Set(commands)]) {
    preconditions.push(commandPrecondition(command, { env, home }));
  }
  if (channel?.minimumNode && operation !== "uninstall") {
    const major = Number(nodeVersion.split(".")[0]);
    preconditions.push({
      kind: "node",
      minimumMajor: channel.minimumNode,
      observed: nodeVersion,
      satisfied: major >= channel.minimumNode,
      detail: `Node.js ${nodeVersion}; this channel requires Node.js ${channel.minimumNode} or newer`,
    });
  }
  if (
    channel?.nodeRanges &&
    (
      operation !== "uninstall" ||
      channel.enforceNodeOnUninstall
    )
  ) {
    const requirement = nodeRangeLabel(channel.nodeRanges);
    preconditions.push({
      kind: "node",
      ranges: channel.nodeRanges,
      observed: nodeVersion,
      satisfied: channel.nodeRanges.some((range) =>
        nodeRangeSatisfied(nodeVersion, range),
      ),
      detail: `Node.js ${nodeVersion}; this channel requires ${requirement}`,
    });
  }
  if (
    channel?.disallowRoot ||
    channel?.disallowRootOperations?.includes(operation)
  ) {
    preconditions.push({
      kind: "non-root",
      observedUid: uid,
      satisfied: uid !== 0,
      detail:
        uid === 0
          ? "this native channel is blocked for root because it would install outside the selected home"
          : "current process is unprivileged",
    });
  }
  return preconditions;
}

export function planToolOperation({
  operation,
  toolId,
  channelId,
  root,
  home = homedir(),
  env = process.env,
  nodeVersion = process.versions.node,
  platform = process.platform,
  uid = process.getuid?.() ?? null,
} = {}) {
  if (!["install", "update", "uninstall"].includes(operation)) {
    throw new Error(`Unsupported agent operation: ${operation}`, {
      cause: { code: "E_TOOL_OPERATION" },
    });
  }
  const tool = getTool(toolId);
  if (!tool) {
    throw new Error(`Unknown agent tool: ${toolId}`, {
      cause: { code: "E_TOOL" },
    });
  }
  const report = inspectAgentTools({
    root,
    home,
    env,
    toolIds: [toolId],
  });
  const status = report.tools[0];

  if (operation === "install" && status.installed) {
    throw new Error(
      `${tool.label} is already installed at ${status.executablePath}. Use "agentctl agents update ${tool.id}" instead.`,
      { cause: { code: "E_ALREADY_INSTALLED" } },
    );
  }
  if (operation !== "install" && !status.installed) {
    throw new Error(`${tool.label} is not installed.`, {
      cause: { code: "E_NOT_INSTALLED" },
    });
  }

  const selectedChannel = selectedChannelFor({
    operation,
    tool,
    status,
    channelId,
  });
  const channel = selectedChannel
    ? getToolChannel(tool, selectedChannel)
    : null;

  if (channelId && !channel) {
    throw new Error(
      `${tool.label} does not support channel "${channelId}". Supported channels: ${tool.channels.map((item) => item.id).join(", ")}.`,
      { cause: { code: "E_CHANNEL" } },
    );
  }

  let step;
  if (operation === "install" && channel?.installerUrl) {
    step = {
      kind: "remote-installer",
      url: channel.installerUrl,
      allowedHosts: channel.installerHosts,
      interpreter: "bash",
      args: channel.installerArgs ?? [],
      pathPolicy: channel.installerPathPolicy ?? null,
      downloadTimeoutMs: DEFAULT_INSTALLER_DOWNLOAD_TIMEOUT_MS,
      timeoutMs: channel.timeoutMs ?? 10 * 60_000,
      display: `download ${channel.installerUrl}, verify its origin, then run ${shellDisplay(["bash", "<downloaded-installer>", ...(channel.installerArgs ?? [])])}`,
    };
  } else if (operation === "uninstall" && channel?.uninstallPaths) {
    step = {
      kind: "remove-paths",
      paths: channel.uninstallPaths,
      display: `remove ${channel.uninstallPaths.map((path) => `~/${path}`).join(" and ")}`,
    };
  } else {
    const fallback =
      operation === "update" && !channel
        ? tool.fallbackUpdate
        : null;
    const configured = channel?.[operation] ?? fallback;
    if (!configured) {
      throw new Error(
        `Cannot safely ${operation} ${tool.label}: installation channel is unknown. Re-run with --channel ${tool.channels.map((item) => item.id).join("|")}.`,
        { cause: { code: "E_CHANNEL_UNKNOWN" } },
      );
    }
    const command = replaceOwningPackageManager(
      replaceToolExecutable(configured, tool, status),
      status,
    );
    if (operation === "uninstall" && channel?.beforeUninstall) {
      const before = replaceOwningPackageManager(
        replaceToolExecutable(
          channel.beforeUninstall,
          tool,
          status,
        ),
        status,
      );
      step = {
        kind: "command-sequence",
        commands: [before, command],
        timeoutMs: channel.timeoutMs ?? 10 * 60_000,
        display: [before, command].map(shellDisplay).join(" && "),
      };
    } else {
      step = {
        kind: "command",
        command,
        timeoutMs: channel?.timeoutMs ?? 10 * 60_000,
        display: shellDisplay(command),
      };
    }
  }

  return {
    schemaVersion: TOOL_PLAN_SCHEMA_VERSION,
    agentctlVersion: VERSION,
    operation,
    root: report.root,
    tool: {
      id: tool.id,
      label: tool.label,
      command: tool.command,
      sourceUrl: tool.sourceUrl,
    },
    before: status,
    channel: channel?.id ?? null,
    channelLabel: channel?.label ?? "tool self-update",
    configurationPolicy: "preserve",
    desiredChange:
      operation === "uninstall"
        ? { enabled: false }
        : {
            enabled: true,
            channel:
              channel?.id ??
              status.desired.channel ??
              tool.defaultChannel,
            version: "latest",
          },
    step,
    preconditions: planPreconditions(channel, step, {
      env,
      home: resolve(home),
      root: report.root,
      nodeVersion,
      platform,
      uid,
      operation,
    }),
    requiresConfirmation: true,
  };
}

function runExternal(command, args, {
  env,
  stdout,
  stderr,
  timeout = 5 * 60_000,
}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env,
    timeout,
    shell: false,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.stdout) stdout.write(result.stdout);
  if (result.stderr) stderr.write(result.stderr);
  if (result.error || result.status !== 0) {
    const detail =
      result.error?.message ??
      `command exited ${result.status ?? "without a status"}`;
    throw new Error(`${command} failed: ${detail}`, {
      cause: { code: "E_TOOL_EXEC" },
    });
  }
}

export async function executeRemoteInstallerStep(step, {
  home,
  env,
  stdout,
  stderr,
  fetchImpl,
}) {
  const source = new URL(step.url);
  if (
    source.protocol !== "https:" ||
    !step.allowedHosts.includes(source.hostname)
  ) {
    throw new Error(`Installer origin is not allowed: ${step.url}`, {
      cause: { code: "E_INSTALLER_ORIGIN" },
    });
  }
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    step.downloadTimeoutMs ?? DEFAULT_INSTALLER_DOWNLOAD_TIMEOUT_MS,
  );
  let bytes;
  try {
    let response;
    try {
      response = await fetchImpl(step.url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": `agentctl/${VERSION}`,
        },
      });
    } catch (error) {
      throw new Error(
        `Installer download failed: ${error.message}`,
        { cause: { code: "E_INSTALLER_DOWNLOAD" } },
      );
    }
    if (!response.ok) {
      throw new Error(
        `Installer download failed with HTTP ${response.status}: ${step.url}`,
        { cause: { code: "E_INSTALLER_DOWNLOAD" } },
      );
    }
    const finalUrl = new URL(response.url || step.url);
    if (
      finalUrl.protocol !== "https:" ||
      !step.allowedHosts.includes(finalUrl.hostname)
    ) {
      throw new Error(`Installer redirected to an untrusted origin: ${finalUrl}`, {
        cause: { code: "E_INSTALLER_ORIGIN" },
      });
    }
    const declaredLength = Number(response.headers?.get?.("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_INSTALLER_BYTES
    ) {
      throw new Error(
        `Installer declared size ${declaredLength} exceeds the allowed limit.`,
        { cause: { code: "E_INSTALLER_SIZE" } },
      );
    }
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        total += chunk.length;
        if (total > MAX_INSTALLER_BYTES) {
          await reader.cancel();
          throw new Error(
            `Installer exceeded the ${MAX_INSTALLER_BYTES}-byte limit.`,
            { cause: { code: "E_INSTALLER_SIZE" } },
          );
        }
        chunks.push(chunk);
      }
      bytes = Buffer.concat(chunks, total);
    } else {
      bytes = Buffer.from(await response.arrayBuffer());
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `Installer download timed out after ${step.downloadTimeoutMs ?? DEFAULT_INSTALLER_DOWNLOAD_TIMEOUT_MS} ms.`,
        { cause: { code: "E_INSTALLER_TIMEOUT" } },
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (bytes.length === 0 || bytes.length > MAX_INSTALLER_BYTES) {
    throw new Error(
      `Installer size ${bytes.length} is outside the allowed range.`,
      { cause: { code: "E_INSTALLER_SIZE" } },
    );
  }
  const sourceText = bytes.toString("utf8");
  if (!sourceText.startsWith("#!")) {
    throw new Error("Installer is not a recognized script.", {
      cause: { code: "E_INSTALLER_FORMAT" },
    });
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  const stage = mkdtempSync(join(tmpdir(), "agentctl-agent-installer-"));
  const installer = join(stage, "installer.sh");
  try {
    writeFileSync(installer, bytes, { mode: 0o700 });
    stdout.write(
      `Downloaded ${step.url}\nSHA-256 ${digest}\n`,
    );
    const installerEnv = { ...env };
    if (step.pathPolicy === "prepend-home-local-bin") {
      installerEnv.PATH = [
        join(resolve(home), ".local", "bin"),
        installerEnv.PATH ?? "",
      ].filter(Boolean).join(delimiter);
    }
    runExternal(step.interpreter, [installer, ...step.args], {
      env: installerEnv,
      stdout,
      stderr,
      timeout: step.timeoutMs,
    });
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  return { installerSha256: digest };
}

export function removeApprovedPaths(step, { home, stdout }) {
  const selectedHome = resolve(home);
  const removed = [];
  for (const relativePath of step.paths) {
    const selected = resolve(selectedHome, relativePath);
    if (
      selected === selectedHome ||
      !selected.startsWith(`${selectedHome}${sep}`)
    ) {
      throw new Error(`Refusing to remove path outside the selected home: ${selected}`, {
        cause: { code: "E_PATH_BOUNDARY" },
      });
    }
    if (!existsSync(selected) && !lstatExists(selected)) continue;
    rmSync(selected, { recursive: true, force: true });
    removed.push(selected);
    stdout.write(`Removed ~/${relative(selectedHome, selected)}\n`);
  }
  return { removedPaths: removed };
}

function lstatExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

export async function executeToolPlan(
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
  if (plan.schemaVersion !== TOOL_PLAN_SCHEMA_VERSION) {
    throw new Error("Unsupported or missing tool plan schema.", {
      cause: { code: "E_TOOL_PLAN" },
    });
  }

  const failedPreconditions = (plan.preconditions ?? []).filter(
    (precondition) => !precondition.satisfied,
  );
  if (failedPreconditions.length > 0) {
    throw new Error(
      `Lifecycle precondition failed: ${failedPreconditions.map((item) => item.detail).join("; ")}`,
      { cause: { code: "E_TOOL_PRECONDITION" } },
    );
  }

  if (plan.desiredChange) {
    updateDesiredTool(plan.root, plan.tool.id, plan.desiredChange);
  }

  const executionEnv = {
    ...env,
    HOME: resolve(home),
  };
  let execution = {};
  if (plan.step.kind === "command") {
    runExternal(plan.step.command[0], plan.step.command.slice(1), {
      env: executionEnv,
      stdout,
      stderr,
      timeout: plan.step.timeoutMs,
    });
  } else if (plan.step.kind === "command-sequence") {
    for (const command of plan.step.commands) {
      runExternal(command[0], command.slice(1), {
        env: executionEnv,
        stdout,
        stderr,
        timeout: plan.step.timeoutMs,
      });
    }
  } else if (plan.step.kind === "remote-installer") {
    execution = await executeRemoteInstallerStep(plan.step, {
      home,
      env: executionEnv,
      stdout,
      stderr,
      fetchImpl,
    });
  } else if (plan.step.kind === "remove-paths") {
    execution = removeApprovedPaths(plan.step, { home, stdout });
  } else {
    throw new Error(`Unknown plan step: ${plan.step.kind}`, {
      cause: { code: "E_TOOL_PLAN" },
    });
  }

  const report = inspectAgentTools({
    root: plan.root,
    home,
    env: executionEnv,
    toolIds: [plan.tool.id],
  });
  const after = report.tools[0];
  if (plan.operation === "uninstall" && after.installed) {
    throw new Error(
      `${plan.tool.label} still resolves at ${after.executablePath}. Another installation may remain; no additional installation was removed.`,
      { cause: { code: "E_TOOL_REMAINS" } },
    );
  }
  if (plan.operation !== "uninstall" && !after.installed) {
    throw new Error(
      `${plan.tool.label} command was not found after ${plan.operation}. Check PATH and the installer output.`,
      { cause: { code: "E_TOOL_UNVERIFIED" } },
    );
  }

  if (plan.operation === "uninstall") {
    removeToolState(plan.root, plan.tool.id);
  } else {
    recordToolState(plan.root, plan.tool.id, {
      managedByAgentctl: true,
      channel: plan.channel,
      version: after.version,
      executablePath: after.executablePath,
      lastOperation: plan.operation,
      updatedAt: now(),
    });
  }

  return {
    schemaVersion: TOOL_RECEIPT_SCHEMA_VERSION,
    agentctlVersion: VERSION,
    operation: plan.operation,
    root: plan.root,
    tool: plan.tool,
    channel: plan.channel,
    configurationPolicy: "preserve",
    execution,
    before: plan.before,
    after,
    completedAt: now(),
  };
}

export function toolCatalogReport() {
  return publicToolCatalog();
}
