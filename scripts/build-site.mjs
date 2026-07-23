import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "site");
const destination = resolve(root, "dist");

if (!existsSync(source)) {
  throw new Error(`Static site source not found: ${source}`);
}

if (existsSync(destination)) {
  rmSync(destination, { recursive: true, force: true });
}
mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true, preserveTimestamps: true });

process.stdout.write(`Built static site: ${destination}\n`);
