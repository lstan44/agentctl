import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(currentDirectory, "..");
const fixtureHome = join(currentDirectory, "fixtures", "home");
const bin = join(root, "bin", "agentctl.mjs");

test("CLI emits parseable JSON without ANSI sequences", () => {
  const result = spawnSync(
    process.execPath,
    [bin, "inspect", "--json", "--home", fixtureHome],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: "",
        XDG_CONFIG_HOME: join(fixtureHome, ".config"),
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, "agentctl.inspect/v1alpha1");
  assert.equal(/\u001b\[/.test(result.stdout), false);
});

test("CLI strict mode uses the documented policy exit code", () => {
  const result = spawnSync(
    process.execPath,
    [bin, "inspect", "--strict", "--home", fixtureHome],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: "",
        XDG_CONFIG_HOME: join(fixtureHome, ".config"),
      },
    },
  );

  assert.equal(result.status, 5);
  assert.match(result.stdout, /No files were changed/);
});

test("CLI help exposes read-only boundaries", () => {
  const result = spawnSync(process.execPath, [bin, "help"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /never execute agent tools, skills, or hooks/);
  assert.match(result.stdout, /require --yes/);
});

test("CLI init defaults to ~/.agentctl and can skip Git", (context) => {
  const home = mkdtempSync(join(tmpdir(), "agentctl-cli-init-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const result = spawnSync(
    process.execPath,
    [bin, "init", "--json", "--no-git", "--home", home],
    {
      encoding: "utf8",
      env: { ...process.env, HOME: home },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.target, join(home, ".agentctl"));
  assert.equal(report.gitInitialized, false);
  assert.match(report.nextSteps.join("\n"), /git push -u origin main/);
});

test("CLI init accepts --root as an explicit canonical path", (context) => {
  const home = mkdtempSync(join(tmpdir(), "agentctl-cli-root-init-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const rootPath = join(home, "versioned-agents");
  const result = spawnSync(
    process.execPath,
    [bin, "init", "--root", rootPath, "--no-git", "--json"],
    {
      encoding: "utf8",
      env: { ...process.env, HOME: home },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).target, rootPath);
});

test("CLI lifecycle is plan-first and requires explicit confirmation", (context) => {
  const home = mkdtempSync(join(tmpdir(), "agentctl-cli-plan-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const rootPath = join(home, ".agentctl");
  const fixtureBin = join(home, "bin");
  mkdirSync(fixtureBin);
  writeFileSync(
    join(fixtureBin, "npm"),
    `#!${process.execPath}\nconsole.log("10.0.0");\n`,
  );
  chmodSync(join(fixtureBin, "npm"), 0o755);
  const isolatedEnv = {
    ...process.env,
    HOME: home,
    PATH: fixtureBin,
  };
  const init = spawnSync(
    process.execPath,
    [bin, "init", "--no-git", "--home", home],
    {
      encoding: "utf8",
      env: isolatedEnv,
    },
  );
  assert.equal(init.status, 0, init.stderr);

  const planned = spawnSync(
    process.execPath,
    [
      bin,
      "agents",
      "install",
      "codex",
      "--root",
      rootPath,
      "--home",
      home,
    ],
    {
      encoding: "utf8",
      env: isolatedEnv,
    },
  );

  assert.equal(planned.status, 2, planned.stderr);
  assert.match(planned.stdout, /exact plan/);
  assert.match(planned.stdout, /Re-run with --yes/);

  const dryRun = spawnSync(
    process.execPath,
    [
      bin,
      "agents",
      "install",
      "codex",
      "--dry-run",
      "--json",
      "--root",
      rootPath,
      "--home",
      home,
    ],
    {
      encoding: "utf8",
      env: isolatedEnv,
    },
  );
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.equal(JSON.parse(dryRun.stdout).applied, false);
});

test("CLI exposes a stable agent-tool catalog", () => {
  const result = spawnSync(
    process.execPath,
    [bin, "agents", "list", "--json"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, "agentctl.tool-catalog/v1alpha1");
  assert.deepEqual(
    report.tools.map((tool) => tool.id),
    [
      "codex",
      "claude",
      "opencode",
      "gemini",
      "copilot",
      "openclaw",
      "hermes",
    ],
  );
});

test("CLI install --all converges missing and already-installed tools", (context) => {
  const home = mkdtempSync(join(tmpdir(), "agentctl-cli-install-all-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const rootPath = join(home, ".agentctl");
  const fixtureBin = join(home, "bin");
  mkdirSync(fixtureBin);
  const npmMarker = join(home, "npm-was-invoked");
  writeFileSync(
    join(fixtureBin, "npm"),
    `#!${process.execPath}
import { writeFileSync } from "node:fs";
if (process.argv.includes("install")) writeFileSync(${JSON.stringify(npmMarker)}, "invoked\\n");
console.log("10.0.0");
`,
  );
  writeFileSync(
    join(fixtureBin, "codex"),
    `#!${process.execPath}\nconsole.log("codex-cli 1.2.3");\n`,
  );
  chmodSync(join(fixtureBin, "npm"), 0o755);
  chmodSync(join(fixtureBin, "codex"), 0o755);
  const isolatedEnv = {
    ...process.env,
    HOME: home,
    PATH: fixtureBin,
  };
  const init = spawnSync(
    process.execPath,
    [bin, "init", "--no-git", "--home", home],
    {
      encoding: "utf8",
      env: isolatedEnv,
    },
  );
  assert.equal(init.status, 0, init.stderr);

  const stateDirectory = join(rootPath, ".agentctl", "state");
  mkdirSync(stateDirectory, { recursive: true });
  writeFileSync(
    join(stateDirectory, "tools.json"),
    `${JSON.stringify({
      schemaVersion: "agentctl.tool-state/v1alpha1",
      tools: {
        codex: {
          managedByAgentctl: false,
          channel: "npm",
          executablePath: join(fixtureBin, "codex"),
        },
      },
    })}\n`,
  );

  const result = spawnSync(
    process.execPath,
    [
      bin,
      "agents",
      "install",
      "--all",
      "--dry-run",
      "--json",
      "--home",
      home,
    ],
    {
      encoding: "utf8",
      env: isolatedEnv,
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.operation, "install");
  assert.equal(report.applied, false);
  assert.equal(report.plans.length, 7);
  assert.equal(
    report.plans.find((plan) => plan.tool.id === "codex").operation,
    "update",
  );
  assert.equal(
    report.plans.find((plan) => plan.tool.id === "gemini").operation,
    "install",
  );

  const confirmed = spawnSync(
    process.execPath,
    [
      bin,
      "agents",
      "install",
      "--all",
      "--yes",
      "--json",
      "--home",
      home,
    ],
    {
      encoding: "utf8",
      env: isolatedEnv,
    },
  );
  assert.equal(confirmed.status, 1);
  assert.match(confirmed.stderr, /preflight failed before any tool was changed/);
  assert.equal(existsSync(npmMarker), false);
});

test("CLI self lifecycle is exposed as a plan-first operation", (context) => {
  const home = mkdtempSync(join(tmpdir(), "agentctl-cli-self-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const isolatedEnv = {
    ...process.env,
    HOME: home,
    PATH: [dirname(process.execPath), "/bin", "/usr/bin"].join(":"),
  };
  const result = spawnSync(
    process.execPath,
    [bin, "self", "update", "--dry-run", "--json", "--home", home],
    {
      encoding: "utf8",
      env: isolatedEnv,
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.applied, false);
  assert.equal(report.plan.schemaVersion, "agentctl.self-plan/v1alpha1");
  assert.equal(report.plan.operation, "update");
});
