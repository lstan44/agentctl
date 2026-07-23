import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initializeEnvironment } from "../src/init.mjs";
import { toolCatalog } from "../src/tool-catalog.mjs";
import {
  readDesiredTools,
  readToolState,
  recordToolState,
} from "../src/tool-state.mjs";
import {
  executeRemoteInstallerStep,
  executeToolPlan,
  inspectAgentTools,
  planToolOperation,
  toolCatalogReport,
} from "../src/tools.mjs";

function fixture(context, prefix) {
  const base = mkdtempSync(join(tmpdir(), prefix));
  context.after(() => rmSync(base, { recursive: true, force: true }));
  const home = join(base, "home");
  const root = join(home, ".agentctl");
  const bin = join(base, "bin");
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });
  initializeEnvironment(root, { home, git: false });
  return {
    base,
    home,
    root,
    bin,
    env: {
      ...process.env,
      HOME: home,
      PATH: bin,
    },
  };
}

function memoryStream() {
  let value = "";
  return {
    write(chunk) {
      value += String(chunk);
    },
    value() {
      return value;
    },
  };
}

function writeExecutable(path, content) {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

function installFakeNpm(fixtureValue) {
  const script = `#!${process.execPath}
import { chmodSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const bin = ${JSON.stringify(fixtureValue.bin)};
const log = ${JSON.stringify(join(fixtureValue.base, "npm.log"))};
writeFileSync(log, process.env.HOME + " " + args.join(" ") + "\\n", { flag: "a" });
if (args[0] === "install") {
  const tool = "#!${process.execPath}\\nconsole.log('codex-cli 9.8.7');\\n";
  const destination = join(bin, "codex");
  writeFileSync(destination, tool);
  chmodSync(destination, 0o755);
}
if (args[0] === "uninstall") {
  const destination = join(bin, "codex");
  if (existsSync(destination)) rmSync(destination);
}
`;
  writeExecutable(join(fixtureValue.bin, "npm"), script);
}

test("tool catalog is complete, unique, and provider-agnostic", () => {
  const report = toolCatalogReport();
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
  assert.equal(
    new Set(report.tools.map((tool) => tool.id)).size,
    report.tools.length,
  );
  for (const tool of report.tools) {
    assert.ok(tool.defaultChannel);
    assert.ok(tool.channels.some((channel) => channel.id === tool.defaultChannel));
    assert.match(tool.sourceUrl, /^https:/);
    assert.equal(tool.configurationPolicy, "preserve");
  }
});

test("catalog recipes are static argument arrays with bounded native paths and origins", () => {
  for (const tool of toolCatalog) {
    if (tool.fallbackUpdate) {
      assert.ok(Array.isArray(tool.fallbackUpdate));
      assert.equal(tool.fallbackUpdate[0], tool.command);
    }
    for (const channel of tool.channels) {
      for (const operation of ["install", "update", "uninstall"]) {
        const command = channel[operation];
        if (!command) continue;
        assert.ok(Array.isArray(command));
        assert.ok(command.length > 0);
        assert.ok(command.every((argument) => typeof argument === "string"));
      }
      if (channel.installerUrl) {
        const url = new URL(channel.installerUrl);
        assert.equal(url.protocol, "https:");
        assert.ok(channel.installerHosts.includes(url.hostname));
      }
      for (const path of channel.uninstallPaths ?? []) {
        assert.equal(path.startsWith("/"), false);
        assert.equal(path.split("/").includes(".."), false);
      }
    }
  }
});

test("official self-updaters cover Gemini and Copilot when the channel is unknown", (context) => {
  const selected = fixture(context, "agentctl-tools-self-updaters-");
  for (const toolId of ["gemini", "copilot"]) {
    writeExecutable(
      join(selected.bin, toolId),
      `#!${process.execPath}\nconsole.log("${toolId} 1.2.3");\n`,
    );
    const plan = planToolOperation({
      operation: "update",
      toolId,
      root: selected.root,
      home: selected.home,
      env: selected.env,
    });
    assert.equal(plan.channel, null);
    assert.deepEqual(plan.step.command, [
      join(selected.bin, toolId),
      "update",
    ]);
  }
});

test("npm lifecycle updates canonical desired truth and ignored machine state", async (context) => {
  const selected = fixture(context, "agentctl-tools-npm-");
  installFakeNpm(selected);
  const stdout = memoryStream();
  const stderr = memoryStream();

  const installPlan = planToolOperation({
    operation: "install",
    toolId: "codex",
    root: selected.root,
    home: selected.home,
    env: selected.env,
  });
  assert.equal(installPlan.channel, "npm");
  assert.ok(installPlan.preconditions.every((item) => item.satisfied));
  const installReceipt = await executeToolPlan(installPlan, {
    home: selected.home,
    env: {
      ...selected.env,
      HOME: join(selected.base, "ambient-home-must-not-win"),
    },
    stdout,
    stderr,
  });
  assert.equal(installReceipt.after.version, "9.8.7");
  assert.equal(readDesiredTools(selected.root).tools.codex.enabled, true);
  assert.equal(readToolState(selected.root).tools.codex.channel, "npm");

  const updatePlan = planToolOperation({
    operation: "update",
    toolId: "codex",
    root: selected.root,
    home: selected.home,
    env: selected.env,
  });
  await executeToolPlan(updatePlan, {
    home: selected.home,
    env: selected.env,
    stdout,
    stderr,
  });

  const uninstallPlan = planToolOperation({
    operation: "uninstall",
    toolId: "codex",
    root: selected.root,
    home: selected.home,
    env: selected.env,
  });
  await executeToolPlan(uninstallPlan, {
    home: selected.home,
    env: selected.env,
    stdout,
    stderr,
  });

  assert.equal(existsSync(join(selected.bin, "codex")), false);
  assert.equal(readDesiredTools(selected.root).tools.codex.enabled, false);
  assert.equal(readToolState(selected.root).tools.codex, undefined);
  const npmLog = readFileSync(join(selected.base, "npm.log"), "utf8");
  assert.ok(npmLog.startsWith(`${selected.home} install --global`));
  assert.match(npmLog, /uninstall --global/);
});

test("known Homebrew installation channel is inferred from the real executable path", (context) => {
  const selected = fixture(context, "agentctl-tools-brew-");
  const realBin = join(selected.base, "Cellar", "opencode", "1.2.3", "bin");
  mkdirSync(realBin, { recursive: true });
  writeExecutable(
    join(realBin, "opencode"),
    `#!${process.execPath}\nconsole.log("1.2.3");\n`,
  );
  selected.env.PATH = realBin;

  const report = inspectAgentTools({
    root: selected.root,
    home: selected.home,
    env: selected.env,
    toolIds: ["opencode"],
  });

  assert.equal(report.tools[0].installed, true);
  assert.equal(report.tools[0].channel, "brew");
  assert.equal(report.tools[0].channelSource, "executable-path");
  assert.equal(report.tools[0].managedByAgentctl, false);
});

test("stale agentctl state cannot override the current executable channel", (context) => {
  const selected = fixture(context, "agentctl-tools-stale-state-");
  const realBin = join(selected.base, "Cellar", "opencode", "1.2.3", "bin");
  mkdirSync(realBin, { recursive: true });
  writeExecutable(
    join(realBin, "opencode"),
    `#!${process.execPath}\nconsole.log("1.2.3");\n`,
  );
  selected.env.PATH = realBin;
  recordToolState(selected.root, "opencode", {
    managedByAgentctl: true,
    channel: "npm",
    executablePath: join(selected.base, "old-npm-bin", "opencode"),
  });

  const report = inspectAgentTools({
    root: selected.root,
    home: selected.home,
    env: selected.env,
    toolIds: ["opencode"],
  });

  assert.equal(report.tools[0].channel, "brew");
  assert.equal(report.tools[0].channelSource, "executable-path");
  assert.equal(report.tools[0].managedByAgentctl, false);
});

test("execution blocks an unsatisfied package-manager precondition before desired state changes", async (context) => {
  const selected = fixture(context, "agentctl-tools-precondition-");
  const plan = planToolOperation({
    operation: "install",
    toolId: "codex",
    root: selected.root,
    home: selected.home,
    env: selected.env,
  });
  assert.equal(
    plan.preconditions.find((item) => item.kind === "command").satisfied,
    false,
  );

  await assert.rejects(
    executeToolPlan(plan, {
      home: selected.home,
      env: selected.env,
      stdout: memoryStream(),
      stderr: memoryStream(),
    }),
    /precondition failed/,
  );
  assert.equal(readDesiredTools(selected.root).tools.codex.enabled, false);
});

test("ordinary npm uninstall is not blocked by an obsolete tool runtime", (context) => {
  const selected = fixture(context, "agentctl-tools-uninstall-node-");
  writeExecutable(
    join(selected.bin, "npm"),
    `#!${process.execPath}\nconsole.log("10.0.0");\n`,
  );
  writeExecutable(
    join(selected.bin, "copilot"),
    `#!${process.execPath}\nconsole.log("copilot 1.2.3");\n`,
  );
  recordToolState(selected.root, "copilot", {
    managedByAgentctl: true,
    channel: "npm",
    executablePath: join(selected.bin, "copilot"),
  });

  const plan = planToolOperation({
    operation: "uninstall",
    toolId: "copilot",
    root: selected.root,
    home: selected.home,
    env: selected.env,
    nodeVersion: "18.20.0",
  });

  assert.equal(
    plan.preconditions.some((item) => item.kind === "node"),
    false,
  );
});

test("native Claude lifecycle records installer evidence and preserves ~/.claude", async (context) => {
  const selected = fixture(context, "agentctl-tools-native-");
  mkdirSync(join(selected.home, ".claude"), { recursive: true });
  writeFileSync(join(selected.home, ".claude", "settings.json"), "{}\n");
  selected.env.PATH = `/bin:/usr/bin:${selected.bin}`;
  const script = `#!/bin/bash
mkdir -p "$HOME/.local/bin" "$HOME/.local/share/claude"
printf '#!/bin/sh\\necho claude-code 4.5.6\\n' > "$HOME/.local/bin/claude"
chmod +x "$HOME/.local/bin/claude"
`;
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    url: "https://claude.ai/install.sh",
    async arrayBuffer() {
      return Buffer.from(script);
    },
  });
  const installPlan = planToolOperation({
    operation: "install",
    toolId: "claude",
    channelId: "native",
    root: selected.root,
    home: selected.home,
    env: selected.env,
  });
  const receipt = await executeToolPlan(installPlan, {
    home: selected.home,
    env: selected.env,
    fetchImpl,
    stdout: memoryStream(),
    stderr: memoryStream(),
  });
  assert.match(receipt.execution.installerSha256, /^[a-f0-9]{64}$/);

  const uninstallPlan = planToolOperation({
    operation: "uninstall",
    toolId: "claude",
    root: selected.root,
    home: selected.home,
    env: selected.env,
  });
  await executeToolPlan(uninstallPlan, {
    home: selected.home,
    env: selected.env,
    stdout: memoryStream(),
    stderr: memoryStream(),
  });

  assert.equal(existsSync(join(selected.home, ".local", "bin", "claude")), false);
  assert.equal(
    readFileSync(join(selected.home, ".claude", "settings.json"), "utf8"),
    "{}\n",
  );
});

test("native installer redirects outside the allowlist are rejected", async (context) => {
  const selected = fixture(context, "agentctl-tools-origin-");
  selected.env.PATH = "/bin:/usr/bin";
  const plan = planToolOperation({
    operation: "install",
    toolId: "claude",
    channelId: "native",
    root: selected.root,
    home: selected.home,
    env: selected.env,
  });

  await assert.rejects(
    executeToolPlan(plan, {
      home: selected.home,
      env: selected.env,
      stdout: memoryStream(),
      stderr: memoryStream(),
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        url: "https://attacker.example/install.sh",
        async arrayBuffer() {
          return Buffer.from("#!/bin/sh\nexit 0\n");
        },
      }),
    }),
    /untrusted origin/,
  );
  assert.equal(readDesiredTools(selected.root).tools.claude.enabled, true);
  assert.equal(readToolState(selected.root).tools.claude, undefined);
});

test("native installer response size is bounded before execution", async (context) => {
  const selected = fixture(context, "agentctl-tools-size-");
  selected.env.PATH = "/bin:/usr/bin";
  const plan = planToolOperation({
    operation: "install",
    toolId: "claude",
    channelId: "native",
    root: selected.root,
    home: selected.home,
    env: selected.env,
  });

  await assert.rejects(
    executeToolPlan(plan, {
      home: selected.home,
      env: selected.env,
      stdout: memoryStream(),
      stderr: memoryStream(),
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        url: "https://claude.ai/install.sh",
        headers: {
          get(name) {
            return name === "content-length" ? String(2 * 1024 * 1024) : null;
          },
        },
        async arrayBuffer() {
          throw new Error("body should not be read");
        },
      }),
    }),
    /exceeds the allowed limit/,
  );
});

test("native installer downloads have a bounded timeout", async () => {
  await assert.rejects(
    executeRemoteInstallerStep(
      {
        kind: "remote-installer",
        url: "https://claude.ai/install.sh",
        allowedHosts: ["claude.ai"],
        interpreter: "bash",
        args: [],
        pathPolicy: null,
        downloadTimeoutMs: 5,
        timeoutMs: 1_000,
        display: "test timeout",
      },
      {
        home: tmpdir(),
        env: process.env,
        stdout: memoryStream(),
        stderr: memoryStream(),
        fetchImpl: async (_url, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new Error("aborted")),
              { once: true },
            );
          }),
      },
    ),
    /timed out after 5 ms/,
  );
});

test("OpenClaw enforces its official disjoint Node.js support range", (context) => {
  const selected = fixture(context, "agentctl-tools-openclaw-node-");
  writeExecutable(
    join(selected.bin, "npm"),
    `#!${process.execPath}\nconsole.log("10.0.0");\n`,
  );
  const unsupported = planToolOperation({
    operation: "install",
    toolId: "openclaw",
    root: selected.root,
    home: selected.home,
    env: selected.env,
    nodeVersion: "23.11.0",
  });
  const supported = planToolOperation({
    operation: "install",
    toolId: "openclaw",
    root: selected.root,
    home: selected.home,
    env: selected.env,
    nodeVersion: "24.15.0",
  });

  assert.equal(
    unsupported.preconditions.find((item) => item.kind === "node").satisfied,
    false,
  );
  assert.equal(
    supported.preconditions.find((item) => item.kind === "node").satisfied,
    true,
  );
});

test("OpenClaw uninstall plans service removal before removing the npm package", (context) => {
  const selected = fixture(context, "agentctl-tools-openclaw-uninstall-");
  writeExecutable(
    join(selected.bin, "openclaw"),
    `#!${process.execPath}\nconsole.log("2026.7.1");\n`,
  );
  writeExecutable(
    join(selected.bin, "npm"),
    `#!${process.execPath}\nconsole.log("10.0.0");\n`,
  );

  const plan = planToolOperation({
    operation: "uninstall",
    toolId: "openclaw",
    channelId: "npm",
    root: selected.root,
    home: selected.home,
    env: selected.env,
    nodeVersion: "22.17.0",
  });

  assert.equal(plan.step.kind, "command-sequence");
  assert.equal(
    plan.preconditions.find((item) => item.kind === "node").satisfied,
    false,
  );
  assert.deepEqual(plan.step.commands[0].slice(1), [
    "uninstall",
    "--service",
    "--yes",
    "--non-interactive",
  ]);
  assert.equal(plan.step.commands[1][0], join(selected.bin, "npm"));
  assert.deepEqual(plan.step.commands[1].slice(1), [
    "uninstall",
    "--global",
    "openclaw",
  ]);
});

test("Hermes native lifecycle avoids shell-profile edits and preserves user data", async (context) => {
  const selected = fixture(context, "agentctl-tools-hermes-");
  selected.env.PATH = `/bin:/usr/bin:${selected.bin}`;
  writeFileSync(join(selected.home, ".zshrc"), "# user profile\n");
  const installer = `#!/bin/bash
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) printf '# installer changed profile\\n' >> "$HOME/.zshrc" ;;
esac
mkdir -p "$HOME/.local/bin" "$HOME/.hermes"
cat > "$HOME/.local/bin/hermes" <<'HERMES'
#!/bin/sh
if [ "$1" = "version" ]; then
  echo "Hermes Agent v0.19.0"
elif [ "$1" = "uninstall" ]; then
  rm -f "$0"
fi
HERMES
chmod +x "$HOME/.local/bin/hermes"
`;
  const plan = planToolOperation({
    operation: "install",
    toolId: "hermes",
    root: selected.root,
    home: selected.home,
    env: selected.env,
  });
  assert.deepEqual(plan.step.args, ["--skip-setup", "--skip-browser"]);
  await executeToolPlan(plan, {
    home: selected.home,
    env: selected.env,
    stdout: memoryStream(),
    stderr: memoryStream(),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      url: "https://hermes-agent.nousresearch.com/install.sh",
      async arrayBuffer() {
        return Buffer.from(installer);
      },
    }),
  });
  assert.equal(readFileSync(join(selected.home, ".zshrc"), "utf8"), "# user profile\n");
  writeFileSync(join(selected.home, ".hermes", "config.yaml"), "model: keep\n");

  const uninstall = planToolOperation({
    operation: "uninstall",
    toolId: "hermes",
    root: selected.root,
    home: selected.home,
    env: selected.env,
  });
  await executeToolPlan(uninstall, {
    home: selected.home,
    env: selected.env,
    stdout: memoryStream(),
    stderr: memoryStream(),
  });

  assert.equal(existsSync(join(selected.home, ".local", "bin", "hermes")), false);
  assert.equal(
    readFileSync(join(selected.home, ".hermes", "config.yaml"), "utf8"),
    "model: keep\n",
  );
});
