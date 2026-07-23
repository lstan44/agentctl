import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { initializeEnvironment } from "../src/init.mjs";

test("init scaffolds a new canonical environment repository", (context) => {
  const root = mkdtempSync(join(tmpdir(), "agentctl-init-test-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const target = join(root, "environment");

  const result = initializeEnvironment(target);

  assert.equal(result.applied, true);
  assert.match(
    readFileSync(join(target, "agentctl.yaml"), "utf8"),
    /kind: AgentEnvironment/,
  );
  assert.match(
    readFileSync(join(target, "agentctl.yaml"), "utf8"),
    /openclaw:[\s\S]*hermes:/,
  );
  assert.match(
    readFileSync(join(target, "catalog", "guidance", "global.md"), "utf8"),
    /Shared agent guidance/,
  );
  if (spawnSync("git", ["--version"]).status === 0) {
    assert.equal(result.gitInitialized, true);
    assert.equal(
      readFileSync(join(target, ".git", "HEAD"), "utf8").trim(),
      "ref: refs/heads/main",
    );
  }
});

test("init dry-run does not create the target", (context) => {
  const root = mkdtempSync(join(tmpdir(), "agentctl-init-dry-test-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const target = join(root, "environment");

  const result = initializeEnvironment(target, { dryRun: true });

  assert.equal(result.applied, false);
  assert.throws(() => readFileSync(join(target, "agentctl.yaml"), "utf8"));
});

test("init refuses to overwrite a non-empty directory", (context) => {
  const root = mkdtempSync(join(tmpdir(), "agentctl-init-refuse-test-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const target = join(root, "environment");
  mkdirSync(target);
  writeFileSync(join(target, "keep.txt"), "preserve me");

  assert.throws(() => initializeEnvironment(target), /Refusing/);
  assert.equal(readFileSync(join(target, "keep.txt"), "utf8"), "preserve me");
});

test("init defaults to ~/.agentctl and gives concrete GitHub next steps", (context) => {
  const home = mkdtempSync(join(tmpdir(), "agentctl-init-home-test-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));

  const result = initializeEnvironment(undefined, {
    home,
    git: false,
    env: { ...process.env, HOME: home },
  });

  assert.equal(result.target, resolve(home, ".agentctl"));
  assert.equal(result.gitInitialized, false);
  assert.match(result.nextSteps.join("\n"), /git remote add origin/);
  assert.match(
    readFileSync(join(result.target, "catalog", "tools.json"), "utf8"),
    /agentctl\.desired-tools/,
  );
  assert.match(
    readFileSync(join(result.target, ".gitignore"), "utf8"),
    /\.agentctl\/state\//,
  );
});

test("init is idempotent for an existing canonical root", (context) => {
  const home = mkdtempSync(join(tmpdir(), "agentctl-init-idempotent-test-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const target = join(home, "environment");

  initializeEnvironment(target, { git: false });
  writeFileSync(join(target, "preserve.md"), "user-owned");
  const second = initializeEnvironment(target, { git: false });

  assert.equal(second.applied, false);
  assert.equal(second.idempotent, true);
  assert.equal(readFileSync(join(target, "preserve.md"), "utf8"), "user-owned");
});
