import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
    readFileSync(join(target, "catalog", "guidance", "global.md"), "utf8"),
    /Shared agent guidance/,
  );
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
