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
  const verb = result.applied ? "initialized" : "would initialize";
  const lines = [
    `${c.teal("agentctl init")} ${c.dim(`· ${result.applied ? "write complete" : "dry run"}`)}`,
    "",
    `${c.green(verb)} ${result.target}`,
    ...result.files.map((file) => `  ${c.dim("+")} ${file}`),
  ];
  if (result.applied) {
    lines.push("", "Next: review agentctl.yaml and commit the repository.");
  } else {
    lines.push("", "No files were changed.");
  }
  stream.write(`${lines.join("\n")}\n`);
}

export function printJson(value, stream = process.stdout) {
  stream.write(`${JSON.stringify(value, null, 2)}\n`);
}
