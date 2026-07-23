import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { getTargetDefinitions, targetIds } from "./targets.mjs";
import { REPORT_SCHEMA_VERSION, VERSION } from "./version.mjs";

const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
const SECRET_KEY_PATTERN =
  /^\s*["']?([A-Za-z0-9_.-]*(?:api[_-]?key|access[_-]?token|auth[_-]?token|authorization|bearer|client[_-]?secret|password|private[_-]?key)[A-Za-z0-9_.-]*)["']?\s*[:=]/i;

function isDirectory(path) {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isRegularFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function displayPath(path, home) {
  const resolvedHome = resolve(home);
  const resolvedPath = resolve(path);
  if (resolvedPath === resolvedHome) return "~";
  if (resolvedPath.startsWith(`${resolvedHome}${sep}`)) {
    return `~${sep}${relative(resolvedHome, resolvedPath)}`;
  }
  return resolvedPath;
}

function walkFiles(root, { maxDepth = 8 } = {}) {
  const files = [];
  if (!isDirectory(root)) return files;

  const visit = (directory, depth) => {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(path, depth + 1);
      else if (entry.isFile()) files.push(path);
    }
  };

  visit(root, 0);
  return files;
}

function countResourceFiles(root, directories) {
  const paths = directories.map((directory) => join(root, directory));
  const files = paths.flatMap((path) => walkFiles(path));
  return {
    count: files.length,
    paths: files,
  };
}

function scanSkills(target, home) {
  const skills = [];
  let scriptFiles = 0;
  let executableFiles = 0;

  for (const skillDirectory of target.skillDirs) {
    const root = join(target.rootPath, skillDirectory);
    if (!isDirectory(root)) continue;

    let entries = [];
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const linked = entry.isSymbolicLink();
      if (!entry.isDirectory() && !linked) continue;
      const skillRoot = join(root, entry.name);
      if (linked) {
        try {
          if (!statSync(skillRoot).isDirectory()) continue;
        } catch {
          continue;
        }
      }
      const skillFile = join(skillRoot, "SKILL.md");
      if (!isRegularFile(skillFile)) continue;

      let content;
      try {
        content = readFileSync(skillFile);
      } catch {
        continue;
      }

      const scripts = linked ? [] : walkFiles(join(skillRoot, "scripts"));
      scriptFiles += scripts.length;
      for (const script of scripts) {
        try {
          if ((statSync(script).mode & 0o111) !== 0) executableFiles += 1;
        } catch {
          // Unreadable script metadata is reflected by omission, not execution.
        }
      }

      skills.push({
        name: entry.name,
        target: target.id,
        path: displayPath(skillRoot, home),
        digest: createHash("sha256").update(content).digest("hex"),
        scriptFiles: scripts.length,
        linked,
      });
    }
  }

  return { skills, scriptFiles, executableFiles };
}

function configCandidates(target, home) {
  const targetFiles = target.configFiles.map((file) =>
    join(target.rootPath, file),
  );
  const homeFiles = (target.homeConfigFiles ?? []).map((file) => join(home, file));
  return [...targetFiles, ...homeFiles].filter(isRegularFile);
}

function inspectConfigFile(path, home, targetId) {
  let size;
  try {
    size = statSync(path).size;
  } catch {
    return {
      path: displayPath(path, home),
      target: targetId,
      skipped: "unreadable",
      potentialSecretKeys: [],
      hasHooks: false,
      hasMcp: false,
    };
  }

  if (size > MAX_CONFIG_BYTES) {
    return {
      path: displayPath(path, home),
      target: targetId,
      skipped: "larger-than-2MiB",
      potentialSecretKeys: [],
      hasHooks: false,
      hasMcp: false,
    };
  }

  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return {
      path: displayPath(path, home),
      target: targetId,
      skipped: "unreadable",
      potentialSecretKeys: [],
      hasHooks: false,
      hasMcp: false,
    };
  }

  const potentialSecretKeys = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const match = line.match(SECRET_KEY_PATTERN);
    if (!match) continue;
    potentialSecretKeys.push({
      key: match[1],
      line: index + 1,
    });
  }

  return {
    path: displayPath(path, home),
    target: targetId,
    skipped: null,
    potentialSecretKeys,
    hasHooks:
      /\bhooks?\b|\[hooks(?:\.[^\]]+)?\]|["']hooks["']\s*:/im.test(content),
    hasMcp: /(?:mcpServers|mcp_servers|mcp\.servers|["']mcp["'])/im.test(content),
  };
}

function scanTarget(target, home) {
  const rootExists = isDirectory(target.rootPath);
  const skillScan = scanSkills(target, home);
  const agents = countResourceFiles(
    target.rootPath,
    target.resourceDirs.agents ?? [],
  );
  const commands = countResourceFiles(
    target.rootPath,
    target.resourceDirs.commands ?? [],
  );
  const rules = countResourceFiles(
    target.rootPath,
    target.resourceDirs.rules ?? [],
  );
  const guidance = target.guidanceFiles
    .map((file) => join(target.rootPath, file))
    .filter(isRegularFile);
  const configs = configCandidates(target, home).map((path) =>
    inspectConfigFile(path, home, target.id),
  );

  const counts = {
    skills: skillScan.skills.length,
    agents: agents.count,
    commands: commands.count,
    rules: rules.count,
    guidance: guidance.length,
    configFiles: configs.length,
    scriptFiles: skillScan.scriptFiles,
    executableFiles: skillScan.executableFiles,
    hookSurfaces: configs.filter((config) => config.hasHooks).length,
    mcpSurfaces: configs.filter((config) => config.hasMcp).length,
    potentialSecretFields: configs.reduce(
      (sum, config) => sum + config.potentialSecretKeys.length,
      0,
    ),
  };

  return {
    id: target.id,
    label: target.label,
    detected: rootExists || target.executableAvailable,
    rootExists,
    executableAvailable: target.executableAvailable,
    root: displayPath(target.rootPath, home),
    counts,
    guidanceFiles: guidance.map((path) => displayPath(path, home)),
    configFiles: configs,
    skills: skillScan.skills,
  };
}

function duplicateGroups(skills) {
  const byDigest = new Map();
  for (const skill of skills) {
    const items = byDigest.get(skill.digest) ?? [];
    items.push(skill);
    byDigest.set(skill.digest, items);
  }

  return [...byDigest.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([digest, items]) => ({
      digest,
      copies: items.length,
      names: [...new Set(items.map((item) => item.name))].sort(),
      targets: [...new Set(items.map((item) => item.target))].sort(),
      paths: items.map((item) => item.path).sort(),
    }))
    .sort((a, b) => b.copies - a.copies || a.digest.localeCompare(b.digest));
}

function divergenceGroups(skills) {
  const byName = new Map();
  for (const skill of skills) {
    const items = byName.get(skill.name) ?? [];
    items.push(skill);
    byName.set(skill.name, items);
  }

  return [...byName.entries()]
    .filter(([, items]) => new Set(items.map((item) => item.digest)).size > 1)
    .map(([name, items]) => ({
      name,
      variants: new Set(items.map((item) => item.digest)).size,
      targets: [...new Set(items.map((item) => item.target))].sort(),
      copies: items
        .map(({ target, path, digest }) => ({ target, path, digest }))
        .sort((a, b) => a.target.localeCompare(b.target)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function makeFindings(summary) {
  const findings = [];
  if (summary.potentialSecretFields > 0) {
    findings.push({
      severity: "high",
      code: "potential-secret-fields",
      title: `${summary.potentialSecretFields} potential secret-bearing field${summary.potentialSecretFields === 1 ? "" : "s"} detected`,
      detail:
        "Only key names and line numbers are reported. Values are intentionally excluded.",
      remediation:
        "Move credential values to a secret manager or environment reference before canonicalization.",
    });
  }
  if (summary.scriptFiles > 0) {
    findings.push({
      severity: "medium",
      code: "skill-script-surfaces",
      title: `${summary.scriptFiles} file${summary.scriptFiles === 1 ? "" : "s"} found under skill script directories`,
      detail:
        "Scripts were inventoried but never executed. Script presence creates an executable supply-chain surface.",
      remediation:
        "Review provenance, permissions, and content before allowing agent execution.",
    });
  }
  if (summary.divergentSkillNames > 0) {
    findings.push({
      severity: "medium",
      code: "divergent-skill-definitions",
      title: `${summary.divergentSkillNames} same-name skill${summary.divergentSkillNames === 1 ? " has" : "s have"} divergent definitions`,
      detail:
        "The same skill name resolves to different SKILL.md content across targets.",
      remediation:
        "Choose a canonical definition and preserve target-only differences as explicit overlays.",
    });
  }
  if (summary.duplicateSkillGroups > 0) {
    findings.push({
      severity: "info",
      code: "canonicalization-opportunity",
      title: `${summary.duplicateSkillGroups} byte-identical skill group${summary.duplicateSkillGroups === 1 ? "" : "s"} can share canonical source`,
      detail:
        "Identical SKILL.md files are currently duplicated across target roots.",
      remediation:
        "Adopt one canonical resource when managed reconciliation becomes appropriate.",
    });
  }
  return findings;
}

export function inspectEnvironment({
  home = homedir(),
  env = process.env,
  target,
  now = () => new Date(),
} = {}) {
  const selectedHome = resolve(home);
  if (target && !targetIds().includes(target)) {
    throw new Error(
      `Unknown target "${target}". Expected one of: ${targetIds().join(", ")}.`,
      { cause: { code: "E_TARGET" } },
    );
  }

  const targets = getTargetDefinitions({ home: selectedHome, env })
    .filter((definition) => !target || definition.id === target)
    .map((definition) => scanTarget(definition, selectedHome));
  const skills = targets.flatMap((item) => item.skills);
  const duplicates = duplicateGroups(skills);
  const divergences = divergenceGroups(skills);
  const summary = {
    targetsScanned: targets.length,
    targetsDetected: targets.filter((item) => item.detected).length,
    resources:
      skills.length +
      targets.reduce(
        (sum, item) =>
          sum +
          item.counts.agents +
          item.counts.commands +
          item.counts.rules +
          item.counts.guidance +
          item.counts.configFiles,
        0,
      ),
    skills: skills.length,
    duplicateSkillGroups: duplicates.length,
    duplicateSkillCopies: duplicates.reduce(
      (sum, group) => sum + group.copies,
      0,
    ),
    divergentSkillNames: divergences.length,
    scriptFiles: targets.reduce(
      (sum, item) => sum + item.counts.scriptFiles,
      0,
    ),
    executableFiles: targets.reduce(
      (sum, item) => sum + item.counts.executableFiles,
      0,
    ),
    hookSurfaces: targets.reduce(
      (sum, item) => sum + item.counts.hookSurfaces,
      0,
    ),
    mcpSurfaces: targets.reduce(
      (sum, item) => sum + item.counts.mcpSurfaces,
      0,
    ),
    potentialSecretFields: targets.reduce(
      (sum, item) => sum + item.counts.potentialSecretFields,
      0,
    ),
  };

  const findings = makeFindings(summary);
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    agentctlVersion: VERSION,
    generatedAt: now().toISOString(),
    mode: "read-only",
    home: displayPath(selectedHome, selectedHome),
    summary,
    targets,
    duplicates,
    divergences,
    findings,
  };
}

export function reportContainsHighRisk(report) {
  return report.findings.some((finding) => finding.severity === "high");
}

export const inspectInternals = {
  displayPath,
  walkFiles,
  inspectConfigFile,
  duplicateGroups,
  divergenceGroups,
};
