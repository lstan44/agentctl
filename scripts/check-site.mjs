import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const htmlFiles = [];
const failures = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile() && extname(entry.name) === ".html") htmlFiles.push(path);
  }
}

function resolveAsset(urlPath) {
  const clean = urlPath.split(/[?#]/)[0];
  if (clean === "/") return join(dist, "index.html");
  const candidate = join(dist, clean.replace(/^\/+/, ""));
  if (clean.endsWith("/")) return join(candidate, "index.html");
  if (existsSync(candidate)) return candidate;
  return join(candidate, "index.html");
}

if (!existsSync(dist)) throw new Error("Run npm run build before site:check.");
walk(dist);

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const relative = file.slice(dist.length);
  const h1Count = (html.match(/<h1(?:\s|>)/g) ?? []).length;
  if (h1Count !== 1) failures.push(`${relative}: expected exactly one h1, found ${h1Count}`);
  if (!/<main(?:\s|>)/.test(html)) failures.push(`${relative}: missing main landmark`);
  if (!/href="#main"/.test(html) && !relative.endsWith("404.html")) {
    failures.push(`${relative}: missing skip link`);
  }

  const references = [...html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)].map(
    (match) => match[1],
  );
  for (const reference of references) {
    if (!existsSync(resolveAsset(reference))) {
      failures.push(`${relative}: missing internal reference ${reference}`);
    }
  }
}

const home = readFileSync(join(dist, "index.html"), "utf8");
const docs = readFileSync(join(dist, "docs", "index.html"), "utf8");
const installer = readFileSync(join(dist, "install.sh"), "utf8");
const requiredCommand =
  "curl -fsSL https://agentctl.justrepl.com/install.sh | bash";

for (const [name, content] of [
  ["home", home],
  ["docs", docs],
  ["llms", readFileSync(join(dist, "llms.txt"), "utf8")],
]) {
  if (!content.includes(requiredCommand)) {
    failures.push(`${name}: missing canonical install command`);
  }
}

if (!home.includes("https://github.com/lstan44/agentctl")) {
  failures.push("home: missing GitHub repository link");
}
if (!home.includes("developed by") && !home.includes("by justREPL")) {
  failures.push("home: missing justREPL provenance");
}
if (/\bsudo\b/.test(installer)) {
  failures.push("installer: must not invoke sudo");
}
if (!installer.includes("checksum verification failed")) {
  failures.push("installer: missing checksum failure guard");
}
if (!installer.includes('say "  agentctl init"')) {
  failures.push("installer: missing canonical-root next step");
}
for (const requiredSurface of [
  "agentctl init",
  "agentctl agents status",
  "agentctl agents install",
  "agentctl self update",
  "~/.agentctl",
  "--dry-run",
  "--yes",
]) {
  if (!docs.includes(requiredSurface)) {
    failures.push(`docs: missing v0.2 surface ${requiredSurface}`);
  }
}
for (const toolName of ["OpenClaw", "Hermes"]) {
  if (!home.includes(toolName) || !docs.includes(toolName)) {
    failures.push(`site: missing expanded catalog tool ${toolName}`);
  }
}
if (!home.includes("v0.2.0")) {
  failures.push("home: missing current release version");
}
if (!home.includes("Configuration-preserving uninstall")) {
  failures.push("home: missing lifecycle preservation promise");
}
if (!docs.includes('<section id="install" data-copy-scope>')) {
  failures.push("docs: install command and live status must share one copy scope");
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(
  `Validated ${htmlFiles.length} HTML pages, internal references, v0.2 lifecycle surfaces, provenance, and installer guards.\n`,
);
