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
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { initializeEnvironment } from "../src/init.mjs";
import {
  executeSelfPlan,
  planSelfOperation,
} from "../src/self.mjs";

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

test("self update verifies the replacement and self uninstall preserves the canonical root", async (context) => {
  const base = mkdtempSync(join(tmpdir(), "agentctl-self-lifecycle-"));
  context.after(() => rmSync(base, { recursive: true, force: true }));
  const home = join(base, "home");
  const installDirectory = join(home, ".local", "bin");
  const libraryDirectory = join(home, ".local", "share", "agentctl");
  const canonicalRoot = join(home, ".agentctl");
  mkdirSync(installDirectory, { recursive: true });
  mkdirSync(libraryDirectory, { recursive: true });
  initializeEnvironment(canonicalRoot, { home, git: false });
  writeFileSync(join(canonicalRoot, "keep.md"), "canonical\n");
  writeExecutable(
    join(installDirectory, "agentctl"),
    '#!/bin/sh\nprintf \'{"schemaVersion":"agentctl.version/v1","version":"0.2.0"}\\n\'\n',
  );
  const env = {
    ...process.env,
    HOME: home,
    AGENTCTL_INSTALL_DIR: installDirectory,
    AGENTCTL_LIB_DIR: libraryDirectory,
    AGENTCTL_REPOSITORY: "https://malicious.invalid/agentctl",
    AGENTCTL_DOWNLOAD_BASE: "https://malicious.invalid/releases",
    AGENTCTL_VERSION: "99.0.0",
    PATH: [
      installDirectory,
      dirname(process.execPath),
      "/bin",
      "/usr/bin",
    ].join(":"),
  };
  const updatePlan = planSelfOperation({
    operation: "update",
    root: canonicalRoot,
    home,
    env,
  });
  assert.ok(updatePlan.preconditions.every((item) => item.satisfied));
  const replacementInstaller = `#!/bin/sh
[ -z "\${AGENTCTL_REPOSITORY:-}" ]
[ -z "\${AGENTCTL_DOWNLOAD_BASE:-}" ]
[ -z "\${AGENTCTL_VERSION:-}" ]
[ "$AGENTCTL_MIN_VERSION" = "0.2.0" ]
mkdir -p "$AGENTCTL_INSTALL_DIR" "$AGENTCTL_LIB_DIR"
cat > "$AGENTCTL_INSTALL_DIR/agentctl" <<'AGENTCTL'
#!/bin/sh
printf '{"schemaVersion":"agentctl.version/v1","version":"0.2.1"}\\n'
AGENTCTL
chmod +x "$AGENTCTL_INSTALL_DIR/agentctl"
`;
  const receipt = await executeSelfPlan(updatePlan, {
    home,
    env,
    stdout: memoryStream(),
    stderr: memoryStream(),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      url: "https://agentctl.justrepl.com/install.sh",
      async arrayBuffer() {
        return Buffer.from(replacementInstaller);
      },
    }),
  });
  assert.equal(receipt.afterVersion, "0.2.1");
  assert.equal(readFileSync(join(canonicalRoot, "keep.md"), "utf8"), "canonical\n");

  const uninstallPlan = planSelfOperation({
    operation: "uninstall",
    root: canonicalRoot,
    home,
    env,
  });
  await executeSelfPlan(uninstallPlan, {
    home,
    env,
    stdout: memoryStream(),
    stderr: memoryStream(),
  });

  assert.equal(existsSync(join(installDirectory, "agentctl")), false);
  assert.equal(existsSync(libraryDirectory), false);
  assert.equal(readFileSync(join(canonicalRoot, "keep.md"), "utf8"), "canonical\n");
});

test("self uninstall refuses any library path that could contain the canonical root", (context) => {
  const base = mkdtempSync(join(tmpdir(), "agentctl-self-boundary-"));
  context.after(() => rmSync(base, { recursive: true, force: true }));
  const home = join(base, "home");
  const canonicalRoot = join(home, ".agentctl");
  mkdirSync(home, { recursive: true });

  assert.throws(
    () =>
      planSelfOperation({
        operation: "uninstall",
        root: canonicalRoot,
        home,
        env: {
          ...process.env,
          HOME: home,
          AGENTCTL_LIB_DIR: home,
        },
      }),
    /outside the selected home|contains the canonical root/,
  );
});

test("self update is plan-first when the managed installation is missing", () => {
  const home = join(tmpdir(), "agentctl-self-missing-not-created");
  const plan = planSelfOperation({
    operation: "update",
    home,
    env: {
      ...process.env,
      HOME: home,
      PATH: [dirname(process.execPath), "/bin", "/usr/bin"].join(":"),
    },
  });
  assert.equal(
    plan.preconditions.find((item) => item.kind === "managed-install").satisfied,
    false,
  );
});

test("self update rejects a replacement version downgrade", async (context) => {
  const base = mkdtempSync(join(tmpdir(), "agentctl-self-downgrade-"));
  context.after(() => rmSync(base, { recursive: true, force: true }));
  const home = join(base, "home");
  const installDirectory = join(home, ".local", "bin");
  const libraryDirectory = join(home, ".local", "share", "agentctl");
  mkdirSync(installDirectory, { recursive: true });
  mkdirSync(libraryDirectory, { recursive: true });
  writeExecutable(
    join(installDirectory, "agentctl"),
    '#!/bin/sh\nprintf \'{"schemaVersion":"agentctl.version/v1","version":"0.2.0"}\\n\'\n',
  );
  const env = {
    ...process.env,
    HOME: home,
    AGENTCTL_INSTALL_DIR: installDirectory,
    AGENTCTL_LIB_DIR: libraryDirectory,
    PATH: [
      installDirectory,
      dirname(process.execPath),
      "/bin",
      "/usr/bin",
    ].join(":"),
  };
  const plan = planSelfOperation({
    operation: "update",
    home,
    env,
  });
  const downgradeInstaller = `#!/bin/sh
[ "$AGENTCTL_MIN_VERSION" = "0.2.0" ]
cat > "$AGENTCTL_INSTALL_DIR/agentctl" <<'AGENTCTL'
#!/bin/sh
printf '{"schemaVersion":"agentctl.version/v1","version":"0.1.9"}\\n'
AGENTCTL
chmod +x "$AGENTCTL_INSTALL_DIR/agentctl"
`;

  await assert.rejects(
    executeSelfPlan(plan, {
      home,
      env,
      stdout: memoryStream(),
      stderr: memoryStream(),
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        url: "https://agentctl.justrepl.com/install.sh",
        async arrayBuffer() {
          return Buffer.from(downgradeInstaller);
        },
      }),
    }),
    /refused a version downgrade/,
  );
});
