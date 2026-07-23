import { homedir } from "node:os";
import { inspectEnvironment, reportContainsHighRisk } from "./inspect.mjs";
import { runDoctor } from "./doctor.mjs";
import { initializeEnvironment } from "./init.mjs";
import {
  printDoctor,
  printInit,
  printInspect,
  printJson,
  printRoot,
  printSelfPlan,
  printSelfReceipt,
  printToolCatalog,
  printToolPlan,
  printToolReceipt,
  printToolStatus,
} from "./output.mjs";
import { resolveAgentRoot } from "./root.mjs";
import { executeSelfPlan, planSelfOperation } from "./self.mjs";
import {
  executeToolPlan,
  inspectAgentTools,
  planToolOperation,
  toolCatalogReport,
} from "./tools.mjs";
import { VERSION } from "./version.mjs";

const HELP = `agentctl — control your agent engineering environment

Usage:
  agentctl inspect [options]
  agentctl doctor [options]
  agentctl init [directory] [options]
  agentctl root [options]
  agentctl agents list [--json]
  agentctl agents status [tool] [options]
  agentctl agents install <tool|--all> [options]
  agentctl agents update <tool|--all> [options]
  agentctl agents uninstall <tool> [options]
  agentctl self update [options]
  agentctl self uninstall [options]
  agentctl version [--json]
  agentctl help

Commands:
  inspect   Read known agent roots and report resources, drift signals, and risk
  doctor    Check the local runtime and target discovery without changing files
  init      Initialize the canonical Git-backed agent root (default ~/.agentctl)
  root      Print the resolved canonical agent root
  agents    List, observe, install, update, or uninstall agentic CLI tools
  self      Update or uninstall agentctl itself
  version   Print the installed agentctl version

Options:
  --json             Emit stable machine-readable JSON
  --home PATH        Inspect a specific home directory
  --root PATH        Use a specific canonical agent root
  --target ID        Limit inspect to codex, claude, gemini, opencode, or cursor
  --channel ID       Select npm, brew, or a supported native channel
  --all              Select every applicable tool
  --yes              Confirm and apply a lifecycle plan
  --strict           Exit 5 when inspect finds potential secret-bearing fields
  --dry-run          Preview init or lifecycle work without changing anything
  --no-git           Initialize a canonical root without running git init
  --no-color         Disable ANSI color
  -h, --help         Show help
  -v, --version      Show version

inspect and doctor are read-only. They never execute agent tools, skills, or hooks.
agents status only invokes each tool's documented version query. Lifecycle
commands print an exact plan and require --yes before changing desired or
machine state. Agent-owned credentials and configuration are preserved.
`;

function parseArgs(args) {
  const options = {
    json: false,
    color: !process.env.NO_COLOR,
    home: homedir(),
    target: null,
    root: null,
    channel: null,
    strict: false,
    dryRun: false,
    yes: false,
    all: false,
    git: true,
    help: false,
    version: false,
    positionals: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--no-color") options.color = false;
    else if (argument === "--strict") options.strict = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--yes") options.yes = true;
    else if (argument === "--all") options.all = true;
    else if (argument === "--no-git") options.git = false;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--version" || argument === "-v") options.version = true;
    else if (
      argument === "--home" ||
      argument === "--target" ||
      argument === "--root" ||
      argument === "--channel"
    ) {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`${argument} requires a value.`, {
          cause: { code: "E_ARGS" },
        });
      }
      if (argument === "--home") options.home = value;
      else if (argument === "--target") options.target = value;
      else if (argument === "--root") options.root = value;
      else options.channel = value;
      index += 1;
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`, {
        cause: { code: "E_ARGS" },
      });
    } else {
      options.positionals.push(argument);
    }
  }
  return options;
}

function lifecycleSelection(operation, options) {
  const toolId = options.positionals[2] ?? null;
  if (options.positionals.length > 3) {
    throw new Error(`${operation} accepts one tool ID or --all.`, {
      cause: { code: "E_ARGS" },
    });
  }
  if (options.all && toolId) {
    throw new Error(`Use a tool ID or --all, not both.`, {
      cause: { code: "E_ARGS" },
    });
  }
  if (operation === "uninstall" && options.all) {
    throw new Error(
      "Bulk uninstall is intentionally unsupported. Uninstall one tool at a time.",
      { cause: { code: "E_ARGS" } },
    );
  }
  if (!options.all && !toolId) {
    throw new Error(`${operation} requires a tool ID or --all.`, {
      cause: { code: "E_ARGS" },
    });
  }
  return { toolId, all: options.all };
}

function batchPlans(operation, options, env) {
  const selection = lifecycleSelection(operation, options);
  const root = resolveAgentRoot({
    root: options.root,
    home: options.home,
    env,
  });
  if (!selection.all) {
    return [
      planToolOperation({
        operation,
        toolId: selection.toolId,
        channelId: options.channel,
        root,
        home: options.home,
        env,
      }),
    ];
  }
  const status = inspectAgentTools({
    root,
    home: options.home,
    env,
  });
  const applicable =
    operation === "install"
      ? status.tools
      : status.tools.filter((tool) => tool.installed);
  if (applicable.length === 0) return [];
  return applicable.map((tool) =>
    planToolOperation({
      operation:
        operation === "install" && tool.installed
          ? "update"
          : operation,
      toolId: tool.id,
      channelId: options.channel,
      root,
      home: options.home,
      env,
    }),
  );
}

function assertBatchPreconditions(plans) {
  const failures = plans.flatMap((plan) =>
    plan.preconditions
      .filter((precondition) => !precondition.satisfied)
      .map((precondition) => ({
        tool: plan.tool.id,
        detail: precondition.detail,
      })),
  );
  if (failures.length === 0) return;
  throw new Error(
    `Lifecycle preflight failed before any tool was changed: ${failures.map((failure) => `${failure.tool}: ${failure.detail}`).join("; ")}`,
    { cause: { code: "E_TOOL_PREFLIGHT" } },
  );
}

function errorPayload(error) {
  return {
    schemaVersion: "agentctl.error/v1alpha1",
    error: {
      code: error.cause?.code ?? "E_AGENTCTL",
      message: error.message,
    },
  };
}

export async function run(
  args,
  {
    stdout = process.stdout,
    stderr = process.stderr,
    env = process.env,
  } = {},
) {
  let options;
  try {
    options = parseArgs(args);
  } catch (error) {
    stderr.write(`${error.message}\nRun "agentctl help" for usage.\n`);
    return 1;
  }

  const command = options.positionals[0] ?? "inspect";
  if (options.help || command === "help") {
    stdout.write(HELP);
    return 0;
  }
  if (options.version || command === "version") {
    if (options.json) {
      printJson(
        { schemaVersion: "agentctl.version/v1", version: VERSION },
        stdout,
      );
    } else {
      stdout.write(`agentctl ${VERSION}\n`);
    }
    return 0;
  }

  try {
    if (command === "inspect") {
      const report = inspectEnvironment({
        home: options.home,
        env,
        target: options.target,
      });
      if (options.json) printJson(report, stdout);
      else printInspect(report, { color: options.color && stdout.isTTY, stream: stdout });
      return options.strict && reportContainsHighRisk(report) ? 5 : 0;
    }

    if (command === "doctor") {
      const report = runDoctor({ home: options.home, env });
      if (options.json) printJson(report, stdout);
      else printDoctor(report, { color: options.color && stdout.isTTY, stream: stdout });
      return report.ok ? 0 : 1;
    }

    if (command === "init") {
      const extra = options.positionals.slice(1);
      if (extra.length > 1) {
        throw new Error("init accepts at most one directory.", {
          cause: { code: "E_ARGS" },
        });
      }
      if (extra[0] && options.root) {
        throw new Error("init accepts a positional directory or --root, not both.", {
          cause: { code: "E_ARGS" },
        });
      }
      const result = initializeEnvironment(extra[0] ?? options.root, {
        dryRun: options.dryRun,
        git: options.git,
        home: options.home,
        env,
      });
      if (options.json) printJson(result, stdout);
      else printInit(result, { color: options.color && stdout.isTTY, stream: stdout });
      return 0;
    }

    if (command === "root") {
      if (options.positionals.length > 1) {
        throw new Error("root does not accept positional arguments.", {
          cause: { code: "E_ARGS" },
        });
      }
      const root = resolveAgentRoot({
        root: options.root,
        home: options.home,
        env,
      });
      if (options.json) {
        printJson(
          {
            schemaVersion: "agentctl.root/v1alpha1",
            root,
          },
          stdout,
        );
      } else {
        printRoot(root, stdout);
      }
      return 0;
    }

    if (command === "agents") {
      const subcommand = options.positionals[1] ?? "list";
      if (subcommand === "list") {
        if (options.positionals.length > 2) {
          throw new Error("agents list does not accept a tool ID.", {
            cause: { code: "E_ARGS" },
          });
        }
        const report = toolCatalogReport();
        if (options.json) printJson(report, stdout);
        else printToolCatalog(report, { stream: stdout });
        return 0;
      }

      if (subcommand === "status") {
        if (options.positionals.length > 3) {
          throw new Error("agents status accepts at most one tool ID.", {
            cause: { code: "E_ARGS" },
          });
        }
        const toolId = options.positionals[2];
        const report = inspectAgentTools({
          root: options.root,
          home: options.home,
          env,
          toolIds: toolId ? [toolId] : undefined,
        });
        if (options.json) printJson(report, stdout);
        else printToolStatus(report, { stream: stdout });
        return 0;
      }

      if (["install", "update", "uninstall"].includes(subcommand)) {
        const plans = batchPlans(subcommand, options, env);
        if (plans.length === 0) {
          const message =
            subcommand === "install"
              ? "Every catalog tool is already installed."
              : "No installed catalog tools were found.";
          if (options.json) {
            printJson(
              {
                schemaVersion: "agentctl.tool-batch/v1alpha1",
                operation: subcommand,
                plans: [],
                receipts: [],
                message,
              },
              stdout,
            );
          } else {
            stdout.write(`${message}\n`);
          }
          return 0;
        }

        if (options.dryRun || !options.yes) {
          if (options.json) {
            printJson(
              {
                schemaVersion: "agentctl.tool-batch/v1alpha1",
                operation: subcommand,
                plans,
                applied: false,
              },
              stdout,
            );
          } else {
            for (const plan of plans) {
              printToolPlan(plan, { stream: stdout });
            }
            if (!options.dryRun) {
              stdout.write("Re-run with --yes to apply this exact plan.\n");
            }
          }
          return options.dryRun ? 0 : 2;
        }

        assertBatchPreconditions(plans);
        const receipts = [];
        for (const plan of plans) {
          const receipt = await executeToolPlan(plan, {
            home: options.home,
            env,
            stdout: options.json ? stderr : stdout,
            stderr,
          });
          receipts.push(receipt);
        }
        if (options.json) {
          printJson(
            {
              schemaVersion: "agentctl.tool-batch/v1alpha1",
              operation: subcommand,
              applied: true,
              receipts,
            },
            stdout,
          );
        } else {
          for (const receipt of receipts) {
            printToolReceipt(receipt, { stream: stdout });
          }
        }
        return 0;
      }

      throw new Error(`Unknown agents command: ${subcommand}`, {
        cause: { code: "E_COMMAND" },
      });
    }

    if (command === "self") {
      const subcommand = options.positionals[1];
      if (!["update", "uninstall"].includes(subcommand)) {
        throw new Error(
          'self requires "update" or "uninstall".',
          { cause: { code: "E_ARGS" } },
        );
      }
      if (options.positionals.length > 2) {
        throw new Error(`self ${subcommand} does not accept a positional argument.`, {
          cause: { code: "E_ARGS" },
        });
      }
      const plan = planSelfOperation({
        operation: subcommand,
        root: options.root,
        home: options.home,
        env,
      });
      if (options.dryRun || !options.yes) {
        if (options.json) {
          printJson(
            {
              schemaVersion: "agentctl.self-batch/v1alpha1",
              applied: false,
              plan,
            },
            stdout,
          );
        } else {
          printSelfPlan(plan, { stream: stdout });
          if (!options.dryRun) {
            stdout.write("Re-run with --yes to apply this exact plan.\n");
          }
        }
        return options.dryRun ? 0 : 2;
      }
      const receipt = await executeSelfPlan(plan, {
        home: options.home,
        env,
        stdout: options.json ? stderr : stdout,
        stderr,
      });
      if (options.json) printJson(receipt, stdout);
      else printSelfReceipt(receipt, { stream: stdout });
      return 0;
    }

    throw new Error(`Unknown command: ${command}`, {
      cause: { code: "E_COMMAND" },
    });
  } catch (error) {
    if (options.json) printJson(errorPayload(error), stderr);
    else stderr.write(`agentctl: ${error.message}\n`);
    return 1;
  }
}

export const cliHelp = HELP;
