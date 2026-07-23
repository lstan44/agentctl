import test from "node:test";
import assert from "node:assert/strict";
import {
  lstatSync,
  mkdtempSync,
  readlinkSync,
  readdirSync,
  rmSync,
} from "node:fs";
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

    const current = join(libraryDirectory, "current");
    const versionDirectory = join(libraryDirectory, VERSION);
    assert.equal(lstatSync(current).isSymbolicLink(), true);
    assert.equal(readlinkSync(current), VERSION);
    assert.equal(
      readdirSync(versionDirectory).some((name) => name.startsWith(".current-")),
      false,
      "activation staging links must not leak into the installed release",
    );
    assert.equal(
      readdirSync(libraryDirectory).some((name) =>
        name.startsWith(`${VERSION}.previous.`),
      ),
      true,
      "repeat installation should preserve the previous release directory",
    );

    const version = run(join(installDirectory, "agentctl"), ["version"]);
    assert.equal(version.stdout.trim(), `agentctl ${VERSION}`);
  } finally {
    rmSync(testRoot, { recursive: true, force: true });
  }
});
