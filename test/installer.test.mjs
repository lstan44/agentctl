import test from "node:test";
import assert from "node:assert/strict";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { VERSION } from "../src/version.mjs";

const root = resolve(import.meta.dirname, "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${command} failed:\n${result.stdout}\n${result.stderr}`,
  );
  return result;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("installer verifies, activates, and safely repeats a release install", () => {
  const testRoot = mkdtempSync(join(tmpdir(), "agentctl-installer-test-"));
  const releaseRoot = join(root, "release");
  const installDirectory = join(testRoot, "bin");
  const libraryDirectory = join(testRoot, "lib");

  try {
    run(process.execPath, ["scripts/package-release.mjs"]);
    const environment = {
      ...process.env,
      AGENTCTL_DOWNLOAD_BASE: pathToFileURL(releaseRoot).href,
      AGENTCTL_INSTALL_DIR: installDirectory,
      AGENTCTL_LIB_DIR: libraryDirectory,
    };

    run("sh", ["site/install.sh"], { env: environment });
    run("sh", ["site/install.sh"], { env: environment });
    run("sh", ["site/install.sh"], { env: environment });

    const current = join(libraryDirectory, "current");
    const command = join(installDirectory, "agentctl");
    const versionDirectory = join(libraryDirectory, VERSION);
    assert.equal(lstatSync(current).isSymbolicLink(), true);
    assert.equal(lstatSync(command).isSymbolicLink(), true);
    assert.equal(readlinkSync(current), VERSION);
    assert.equal(
      readdirSync(versionDirectory).some((name) => name.startsWith(".current-")),
      false,
      "activation staging links must not leak into the installed release",
    );
    assert.equal(
      readdirSync(libraryDirectory).filter((name) =>
        name.startsWith(`${VERSION}.previous.`),
      ).length,
      2,
      "every repeat installation should preserve a distinct previous release",
    );

    const version = run(join(installDirectory, "agentctl"), ["version"]);
    assert.equal(version.stdout.trim(), `agentctl ${VERSION}`);

    const downgrade = spawnSync("sh", ["site/install.sh"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...environment,
        AGENTCTL_MIN_VERSION: "9.0.0",
      },
    });
    assert.notEqual(downgrade.status, 0);
    assert.match(downgrade.stderr, /refusing to install/);
    assert.equal(
      run(join(installDirectory, "agentctl"), ["version"]).stdout.trim(),
      `agentctl ${VERSION}`,
    );
  } finally {
    rmSync(testRoot, { recursive: true, force: true });
  }
});

test("release packaging is reproducible for identical source", () => {
  const archive = join(root, "release", `agentctl-${VERSION}.tar.gz`);
  run(process.execPath, ["scripts/package-release.mjs"]);
  const first = sha256(archive);
  run(process.execPath, ["scripts/package-release.mjs"]);
  assert.equal(sha256(archive), first);
});
