import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
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

if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

for (const path of ["bin", "src", "README.md", "LICENSE", "SECURITY.md", "package.json"]) {
  cpSync(join(root, path), join(stage, basename(path)), { recursive: true });
}

const tar = spawnSync(
  "tar",
  ["-czf", archive, "-C", releaseRoot, name],
  { encoding: "utf8" },
);
if (tar.status !== 0) {
  process.stderr.write(tar.stderr);
  process.exit(tar.status ?? 1);
}

const digest = createHash("sha256").update(readFileSync(archive)).digest("hex");
writeFileSync(checksum, `${digest}  ${basename(archive)}\n`, "utf8");
rmSync(stage, { recursive: true, force: true });

process.stdout.write(`${archive}\n${checksum}\n`);
