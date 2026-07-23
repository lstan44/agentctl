import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { rootPaths, isInitializedRoot } from "./root.mjs";
import { toolCatalog } from "./tool-catalog.mjs";

export const DESIRED_TOOLS_SCHEMA_VERSION =
  "agentctl.desired-tools/v1alpha1";
export const TOOL_STATE_SCHEMA_VERSION = "agentctl.tool-state/v1alpha1";

export function defaultDesiredTools() {
  return {
    schemaVersion: DESIRED_TOOLS_SCHEMA_VERSION,
    tools: Object.fromEntries(
      toolCatalog.map((tool) => [
        tool.id,
        {
          enabled: false,
          channel: tool.defaultChannel,
          version: "latest",
        },
      ]),
    ),
  };
}

function readJson(path, { missingValue, code }) {
  if (!existsSync(path)) return structuredClone(missingValue);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${error.message}`, {
      cause: { code },
    });
  }
}

function writeJsonAtomic(path, value, { mode = 0o600 } = {}) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  const stage = join(
    directory,
    `.${basename(path)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    writeFileSync(stage, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode,
    });
    renameSync(stage, path);
  } catch (error) {
    if (existsSync(stage)) rmSync(stage, { force: true });
    throw error;
  }
}

export function readDesiredTools(root) {
  const { tools } = rootPaths(root);
  const value = readJson(tools, {
    missingValue: defaultDesiredTools(),
    code: "E_DESIRED_TOOLS",
  });
  if (
    value.schemaVersion !== DESIRED_TOOLS_SCHEMA_VERSION ||
    typeof value.tools !== "object" ||
    value.tools === null
  ) {
    throw new Error(`Unsupported desired-tools document: ${tools}`, {
      cause: { code: "E_DESIRED_TOOLS" },
    });
  }
  return value;
}

export function updateDesiredTool(root, toolId, patch) {
  if (!isInitializedRoot(root)) {
    throw new Error(
      `Canonical root is not initialized: ${root}. Run "agentctl init" first.`,
      { cause: { code: "E_ROOT_UNINITIALIZED" } },
    );
  }
  const paths = rootPaths(root);
  const desired = readDesiredTools(root);
  desired.tools[toolId] = {
    ...(desired.tools[toolId] ?? {}),
    ...patch,
  };
  writeJsonAtomic(paths.tools, desired, { mode: 0o644 });
  return desired.tools[toolId];
}

export function readToolState(root) {
  const { toolState } = rootPaths(root);
  const value = readJson(toolState, {
    missingValue: {
      schemaVersion: TOOL_STATE_SCHEMA_VERSION,
      tools: {},
    },
    code: "E_TOOL_STATE",
  });
  if (
    value.schemaVersion !== TOOL_STATE_SCHEMA_VERSION ||
    typeof value.tools !== "object" ||
    value.tools === null
  ) {
    throw new Error(`Unsupported tool-state document: ${toolState}`, {
      cause: { code: "E_TOOL_STATE" },
    });
  }
  return value;
}

export function recordToolState(root, toolId, record) {
  const paths = rootPaths(root);
  const state = readToolState(root);
  state.tools[toolId] = record;
  writeJsonAtomic(paths.toolState, state);
  return record;
}

export function removeToolState(root, toolId) {
  const paths = rootPaths(root);
  const state = readToolState(root);
  delete state.tools[toolId];
  writeJsonAtomic(paths.toolState, state);
}
