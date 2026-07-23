import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import packageJson from "../package.json" with { type: "json" };

const root = resolve(import.meta.dirname, "..");
const releaseRoot = join(root, "release");
const name = `agentctl-${packageJson.version}`;
const stage = join(releaseRoot, name);
const archive = join(releaseRoot, `${name}.tar.gz`);
const checksum = `${archive}.sha256`;
const archiveStage = `${archive}.${process.pid}.tmp`;
const checksumStage = `${checksum}.${process.pid}.tmp`;
const normalizedTimestamp = new Date("2000-01-01T00:00:00.000Z");

function normalizeTree(path) {
  if (statSync(path).isDirectory()) {
    for (const entry of readdirSync(path).sort()) {
      normalizeTree(join(path, entry));
    }
  }
  utimesSync(path, normalizedTimestamp, normalizedTimestamp);
}

if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

try {
  for (const path of [
    "bin",
    "src",
    "docs",
    "spec",
    "README.md",
    "CHANGELOG.md",
    "LICENSE",
    "SECURITY.md",
    "package.json",
  ]) {
    cpSync(join(root, path), join(stage, basename(path)), { recursive: true });
  }
  normalizeTree(stage);

  const tar = spawnSync(
    "tar",
    ["-czf", archiveStage, "-C", releaseRoot, name],
    { encoding: "utf8" },
  );
  if (tar.error || tar.status !== 0) {
    throw new Error(
      tar.error?.message ?? tar.stderr.trim() ?? "tar failed",
    );
  }

  const digest = createHash("sha256")
    .update(readFileSync(archiveStage))
    .digest("hex");
  writeFileSync(
    checksumStage,
    `${digest}  ${basename(archive)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  renameSync(archiveStage, archive);
  renameSync(checksumStage, checksum);
} finally {
  rmSync(stage, { recursive: true, force: true });
  rmSync(archiveStage, { force: true });
  rmSync(checksumStage, { force: true });
}

process.stdout.write(`${archive}\n${checksum}\n`);
