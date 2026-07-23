import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

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
});
