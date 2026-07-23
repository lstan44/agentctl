import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export function expandHomePath(value, home = homedir()) {
  if (!value) return value;
  if (value === "~") return resolve(home);
  if (value.startsWith("~/")) return resolve(home, value.slice(2));
  return value;
}

export function resolveAgentRoot({
  root,
  home = homedir(),
  env = process.env,
} = {}) {
  const selected =
    root ?? env.AGENTCTL_ROOT ?? join(resolve(home), ".agentctl");
  const expanded = expandHomePath(selected, home);
  return isAbsolute(expanded) ? resolve(expanded) : resolve(expanded);
}

export function rootPaths(root) {
  const resolvedRoot = resolve(root);
  return {
    root: resolvedRoot,
    manifest: join(resolvedRoot, "agentctl.yaml"),
    tools: join(resolvedRoot, "catalog", "tools.json"),
    internal: join(resolvedRoot, ".agentctl"),
    state: join(resolvedRoot, ".agentctl", "state"),
    toolState: join(resolvedRoot, ".agentctl", "state", "tools.json"),
  };
}

export function isInitializedRoot(root) {
  const paths = rootPaths(root);
  return existsSync(paths.manifest) && existsSync(paths.tools);
}
