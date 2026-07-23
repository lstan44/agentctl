const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  teal: "\u001b[36m",
  amber: "\u001b[33m",
  red: "\u001b[31m",
  green: "\u001b[32m",
};

function palette(enabled) {
  const color = (name, value) =>
    enabled ? `${ANSI[name]}${value}${ANSI.reset}` : value;
  return {
    bold: (value) => color("bold", value),
    dim: (value) => color("dim", value),
    teal: (value) => color("teal", value),
    amber: (value) => color("amber", value),
    red: (value) => color("red", value),
    green: (value) => color("green", value),
  };
}

function pad(value, width) {
  return String(value).padEnd(width, " ");
}

export function printInspect(report, { color = true, stream = process.stdout } = {}) {
  const c = palette(color);
  const lines = [];
  lines.push(`${c.teal("agentctl inspect")} ${c.dim("· read-only")}`);
  lines.push(
    `${report.summary.targetsDetected}/${report.summary.targetsScanned} targets detected · ${report.summary.resources} resources`,
  );
  lines.push("");
  lines.push(
    `${pad("TARGET", 15)} ${pad("STATE", 10)} ${pad("SKILLS", 7)} ${pad("AGENTS", 7)} ${pad("CMDS", 6)} ${pad("RULES", 6)} CONFIG`,
  );

  for (const target of report.targets) {
    const state = target.detected ? c.green("detected") : c.dim("absent");
    lines.push(
      `${pad(target.label, 15)} ${pad(state, color ? 19 : 10)} ${pad(target.counts.skills, 7)} ${pad(target.counts.agents, 7)} ${pad(target.counts.commands, 6)} ${pad(target.counts.rules, 6)} ${target.counts.configFiles}`,
    );
  }

  lines.push("");
  lines.push(c.bold("Environment signal"));
  lines.push(
    `  duplicate skill groups   ${report.summary.duplicateSkillGroups}`,
  );
  lines.push(
    `  divergent skill names   ${report.summary.divergentSkillNames}`,
  );
  lines.push(`  skill script files      ${report.summary.scriptFiles}`);
  lines.push(`  MCP config surfaces     ${report.summary.mcpSurfaces}`);
  lines.push(`  hook config surfaces    ${report.summary.hookSurfaces}`);
  lines.push(
    `  potential secret fields ${report.summary.potentialSecretFields}`,
  );

  if (report.findings.length > 0) {
    lines.push("");
    lines.push(c.bold("Findings"));
    for (const finding of report.findings) {
      const label =
        finding.severity === "high"
          ? c.red("HIGH")
          : finding.severity === "medium"
            ? c.amber("MED ")
            : c.teal("INFO");
      lines.push(`  ${label}  ${finding.title}`);
      lines.push(`        ${c.dim(finding.remediation)}`);
    }
  }

  lines.push("");
  lines.push(c.dim("No files were changed. Use --json for the full report."));
  stream.write(`${lines.join("\n")}\n`);
}

export function printDoctor(report, { color = true, stream = process.stdout } = {}) {
  const c = palette(color);
  const lines = [`${c.teal("agentctl doctor")} ${c.dim("· read-only")}`, ""];
  for (const check of report.checks) {
    const status =
      check.status === "pass"
        ? c.green("PASS")
        : check.status === "warn"
          ? c.amber("WARN")
          : c.red("FAIL");
    lines.push(`  ${status}  ${check.detail}`);
    if (check.recovery) lines.push(`        ${c.dim(check.recovery)}`);
  }
  lines.push("");
  lines.push(
    report.ok
      ? c.green("Environment is ready for agentctl.")
      : c.red("Resolve failed checks before continuing."),
  );
  stream.write(`${lines.join("\n")}\n`);
}

export function printInit(result, { color = true, stream = process.stdout } = {}) {
  const c = palette(color);
  const verb = result.idempotent
    ? "already initialized"
    : result.applied
      ? "initialized"
      : "would initialize";
  const lines = [
    `${c.teal("agentctl init")} ${c.dim(`· ${result.idempotent ? "idempotent" : result.applied ? "write complete" : "dry run"}`)}`,
    "",
    `${c.green(verb)} ${result.target}`,
  ];
  if (!result.idempotent) {
    lines.push(...result.files.map((file) => `  ${c.dim("+")} ${file}`));
  }
  lines.push(
    "",
    !result.applied && !result.idempotent
      ? result.initializeGit
        ? c.dim("Git repository would be initialized. No commit or remote would be created.")
        : c.dim("Git initialization is disabled for this run.")
      : result.gitInitialized
        ? c.green("Git repository initialized. No commit or remote was created.")
        : c.dim("Git repository was not initialized."),
  );
  if (result.warning) lines.push(c.amber(result.warning));
  if (result.applied) {
    lines.push(
      "",
      c.bold("Version-control it and push to GitHub"),
      ...result.nextSteps.map((step) => `  ${step}`),
    );
  } else if (result.idempotent) {
    lines.push(
      "",
      c.bold("Git/GitHub next steps"),
      ...result.nextSteps.map((step) => `  ${step}`),
    );
  } else {
    lines.push("", "No files were changed.");
  }
  stream.write(`${lines.join("\n")}\n`);
}

export function printRoot(root, stream = process.stdout) {
  stream.write(`${root}\n`);
}

export function printToolCatalog(
  report,
  { color = true, stream = process.stdout } = {},
) {
  const c = palette(color);
  const lines = [
    `${c.teal("agentctl agents list")} ${c.dim("· provider-agnostic catalog")}`,
    "",
    `${pad("ID", 12)} ${pad("TOOL", 24)} ${pad("DEFAULT", 10)} CHANNELS`,
  ];
  for (const tool of report.tools) {
    lines.push(
      `${pad(tool.id, 12)} ${pad(tool.label, 24)} ${pad(tool.defaultChannel, 10)} ${tool.channels.map((channel) => channel.id).join(", ")}`,
    );
  }
  lines.push(
    "",
    c.dim("Lifecycle operations preserve agent-owned credentials and configuration."),
  );
  stream.write(`${lines.join("\n")}\n`);
}

export function printToolStatus(
  report,
  { color = true, stream = process.stdout } = {},
) {
  const c = palette(color);
  const lines = [
    `${c.teal("agentctl agents status")} ${c.dim("· version probes only")}`,
    `${report.summary.installed}/${report.summary.catalogTools} installed · ${report.summary.drifted} drifted`,
    "",
    `${pad("ID", 12)} ${pad("INSTALLED", 11)} ${pad("VERSION", 15)} ${pad("CHANNEL", 10)} ${pad("DESIRED", 9)} DRIFT`,
  ];
  for (const tool of report.tools) {
    lines.push(
      `${pad(tool.id, 12)} ${pad(tool.installed ? "yes" : "no", 11)} ${pad(tool.version ?? "—", 15)} ${pad(tool.channel ?? "unknown", 10)} ${pad(tool.desired.enabled ? "enabled" : "disabled", 9)} ${tool.drift}`,
    );
    if (tool.versionError) {
      lines.push(`  ${c.amber("version probe failed:")} ${tool.versionError}`);
    }
  }
  lines.push("", c.dim(`Canonical root: ${report.root}`));
  stream.write(`${lines.join("\n")}\n`);
}

export function printToolPlan(
  plan,
  { color = true, stream = process.stdout } = {},
) {
  const c = palette(color);
  const desired = plan.desiredChange
    ? `desired ${plan.desiredChange.enabled ? "enabled" : "disabled"}`
    : "desired state unchanged";
  const lines = [
    `${c.teal(`agentctl agents ${plan.operation}`)} ${c.dim("· exact plan")}`,
    "",
    `  tool       ${plan.tool.label} (${plan.tool.id})`,
    `  channel    ${plan.channelLabel}`,
    `  desired    ${desired}`,
    `  config     preserve`,
    `  execute    ${plan.step.display}`,
    ...plan.preconditions.map(
      (precondition) =>
        `  requires   ${precondition.satisfied ? "ready" : "MISSING"} · ${precondition.detail}`,
    ),
    "",
  ];
  stream.write(`${lines.join("\n")}\n`);
}

export function printToolReceipt(
  receipt,
  { color = true, stream = process.stdout } = {},
) {
  const c = palette(color);
  stream.write(
    `${c.green("completed")} ${receipt.operation} ${receipt.tool.label}` +
      `${receipt.after.version ? ` · ${receipt.after.version}` : ""}` +
      ` · configuration preserved\n`,
  );
}

export function printSelfPlan(
  plan,
  { color = true, stream = process.stdout } = {},
) {
  const c = palette(color);
  const lines = [
    `${c.teal(`agentctl self ${plan.operation}`)} ${c.dim("· exact plan")}`,
    "",
    `  current    ${plan.currentVersion}`,
    `  preserve   ${plan.preservationPolicy}`,
    `  root       ${plan.canonicalRoot}`,
    `  execute    ${plan.step.display}`,
    ...plan.preconditions.map(
      (precondition) =>
        `  requires   ${precondition.satisfied ? "ready" : "MISSING"} · ${precondition.detail}`,
    ),
    "",
  ];
  stream.write(`${lines.join("\n")}\n`);
}

export function printSelfReceipt(
  receipt,
  { color = true, stream = process.stdout } = {},
) {
  const c = palette(color);
  const version = receipt.afterVersion
    ? ` · ${receipt.afterVersion}`
    : "";
  stream.write(
    `${c.green("completed")} self ${receipt.operation}${version}` +
      ` · canonical root preserved at ${receipt.canonicalRoot}\n`,
  );
}

export function printJson(value, stream = process.stdout) {
  stream.write(`${JSON.stringify(value, null, 2)}\n`);
}
