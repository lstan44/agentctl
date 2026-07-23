import { readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import packageJson from "../package.json" with { type: "json" };
import { VERSION } from "../src/version.mjs";

const root = resolve(import.meta.dirname, "..");
const directories = ["bin", "src", "scripts", "test"];
const files = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile() && [".mjs", ".js"].includes(extname(entry.name))) {
      files.push(path);
    }
  }
}

for (const directory of directories) walk(join(root, directory));
files.push(join(root, "site", "assets", "app.js"));

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(1);
  }
}

const shellCheck = spawnSync("sh", ["-n", join(root, "site", "install.sh")], {
  encoding: "utf8",
});
if (shellCheck.status !== 0) {
  process.stderr.write(shellCheck.stderr);
  process.exit(1);
}

if (packageJson.version !== VERSION) {
  throw new Error(
    `Version mismatch: package.json=${packageJson.version}, src/version.mjs=${VERSION}`,
  );
}

if (statSync(join(root, "site", "install.sh")).size < 500) {
  throw new Error("Installer is unexpectedly small.");
}

process.stdout.write(
  `Checked ${files.length} JavaScript modules, installer syntax, and version consistency.\n`,
);
