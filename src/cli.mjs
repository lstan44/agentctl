import { homedir } from "node:os";
import { inspectEnvironment, reportContainsHighRisk } from "./inspect.mjs";
import { runDoctor } from "./doctor.mjs";
import { initializeEnvironment } from "./init.mjs";
import {
  printDoctor,
  printInit,
  printInspect,
  printJson,
} from "./output.mjs";
import { VERSION } from "./version.mjs";

const HELP = `agentctl — know what controls your agents

Usage:
  agentctl inspect [options]
  agentctl doctor [options]
  agentctl init [directory] [options]
  agentctl version [--json]
  agentctl help

Commands:
  inspect   Read known agent roots and report resources, drift signals, and risk
  doctor    Check the local runtime and target discovery without changing files
  init      Scaffold a new Agent Environment as Code repository
  version   Print the installed agentctl version

Options:
  --json             Emit stable machine-readable JSON
  --home PATH        Inspect a specific home directory
  --target ID        Limit inspect to codex, claude, gemini, opencode, or cursor
  --strict           Exit 5 when inspect finds potential secret-bearing fields
  --dry-run          Preview init without writing
  --no-color         Disable ANSI color
  -h, --help         Show help
  -v, --version      Show version

inspect and doctor are read-only. They never execute agent tools, skills, or hooks.
`;

function parseArgs(args) {
  const options = {
    json: false,
    color: !process.env.NO_COLOR,
    home: homedir(),
    target: null,
    strict: false,
    dryRun: false,
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
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--version" || argument === "-v") options.version = true;
    else if (argument === "--home" || argument === "--target") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`${argument} requires a value.`, {
          cause: { code: "E_ARGS" },
        });
      }
      if (argument === "--home") options.home = value;
      else options.target = value;
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
      const result = initializeEnvironment(extra[0] ?? "agent-environment", {
        dryRun: options.dryRun,
      });
      if (options.json) printJson(result, stdout);
      else printInit(result, { color: options.color && stdout.isTTY, stream: stdout });
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
