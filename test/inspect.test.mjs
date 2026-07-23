import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { inspectEnvironment } from "../src/inspect.mjs";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureHome = join(currentDirectory, "fixtures", "home");

test("inspect reports targets, duplicates, divergence, scripts, and config surfaces", () => {
  const report = inspectEnvironment({
    home: fixtureHome,
    env: { PATH: "", XDG_CONFIG_HOME: join(fixtureHome, ".config") },
    now: () => new Date("2026-07-23T12:00:00.000Z"),
  });

  assert.equal(report.mode, "read-only");
  assert.equal(report.summary.targetsDetected, 4);
  assert.equal(report.summary.skills, 4);
  assert.equal(report.summary.duplicateSkillGroups, 1);
  assert.equal(report.summary.divergentSkillNames, 1);
  assert.equal(report.summary.scriptFiles, 1);
  assert.equal(report.summary.potentialSecretFields, 2);
  assert.equal(report.summary.hookSurfaces, 2);
  assert.equal(report.summary.mcpSurfaces, 2);
});

test("inspect output never contains secret values", () => {
  const report = inspectEnvironment({
    home: fixtureHome,
    env: { PATH: "", XDG_CONFIG_HOME: join(fixtureHome, ".config") },
  });
  const serialized = JSON.stringify(report);

  assert.equal(serialized.includes("fixture-secret-must-never-appear"), false);
  assert.equal(serialized.includes("authorization_token"), true);
  assert.equal(serialized.includes("apiKey"), true);
});

test("inspect can limit the report to one target", () => {
  const report = inspectEnvironment({
    home: fixtureHome,
    env: { PATH: "", XDG_CONFIG_HOME: join(fixtureHome, ".config") },
    target: "codex",
  });

  assert.equal(report.targets.length, 1);
  assert.equal(report.targets[0].id, "codex");
  assert.equal(report.summary.targetsScanned, 1);
});

test("inspect rejects an unknown target", () => {
  assert.throws(
    () => inspectEnvironment({ home: fixtureHome, target: "unknown" }),
    /Unknown target/,
  );
});

test("inspect accounts for an explicitly linked skill without traversing its scripts", (context) => {
  const root = mkdtempSync(join(tmpdir(), "agentctl-linked-skill-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "home");
  const source = join(root, "linked-source");
  mkdirSync(join(home, ".codex", "skills"), { recursive: true });
  mkdirSync(join(source, "scripts"), { recursive: true });
  writeFileSync(
    join(source, "SKILL.md"),
    "---\nname: linked\ndescription: fixture\n---\n",
  );
  writeFileSync(join(source, "scripts", "outside.sh"), "#!/bin/sh\n");
  symlinkSync(source, join(home, ".codex", "skills", "linked"));

  const report = inspectEnvironment({ home, env: { PATH: "" } });
  const skill = report.targets[0].skills[0];

  assert.equal(skill.name, "linked");
  assert.equal(skill.linked, true);
  assert.equal(skill.scriptFiles, 0);
  assert.equal(report.summary.skills, 1);
});
