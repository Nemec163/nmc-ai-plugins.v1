#!/usr/bin/env node
"use strict";

const path = require("path");

const { printSummary, setupOpenClaw } = require("./openclaw-setup");

function usage() {
  return [
    "Usage: node scripts/setup-openclaw.js [options]",
    "",
    "Options:",
    "  --state-dir <path>",
    "  --workspace-root <path>",
    "  --system-root <path>",
    "  --memory-root <path>",
    "  --config-path <path>",
    "  --overwrite",
    "  --no-config",
    "  --bind <agent=channel[:accountId[:peerId]]>",
    "  --model-nyx <model>",
    "  --model-medea <model>",
    "  --model-arx <model>",
    "  --model-lev <model>",
    "  --model-mnemo <model>",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    bind: [],
    config: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--overwrite") {
      options.overwrite = true;
      continue;
    }

    if (arg === "--no-config") {
      options.config = false;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`unexpected argument: ${arg}`);
    }

    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = argv[index + 1];
    if (value == null) {
      throw new Error(`missing value for ${arg}`);
    }

    index += 1;

    if (key === "bind") {
      options.bind.push(value);
      continue;
    }

    options[key] = value;
  }

  return options;
}

function runSetupCli(argv, pluginRoot) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `error: ${error.message}\n${usage()}\n`,
    };
  }

  if (options.help) {
    return {
      exitCode: 0,
      stdout: `${usage()}\n`,
      stderr: "",
    };
  }

  try {
    const result = setupOpenClaw({
      pluginRoot: path.resolve(pluginRoot),
      stateDir: options.stateDir,
      workspaceRoot: options.workspaceRoot,
      systemRoot: options.systemRoot,
      memoryRoot: options.memoryRoot,
      configPath: options.configPath,
      overwrite: options.overwrite,
      writeConfig: options.config,
      bindings: options.bind,
      models: {
        nyx: options.modelNyx,
        medea: options.modelMedea,
        arx: options.modelArx,
        lev: options.modelLev,
        mnemo: options.modelMnemo,
      },
    });

    return {
      exitCode: 0,
      stdout: `${printSummary(result)}\n`,
      stderr: "",
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `error: ${error.message}\n`,
    };
  }
}

module.exports = {
  parseArgs,
  runSetupCli,
  usage,
};

if (require.main === module) {
  const result = runSetupCli(
    process.argv.slice(2),
    process.env.OPENCLAW_PLUGIN_ROOT ||
      path.resolve(__dirname, "../../../nmc-memory-plugin"),
  );
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exitCode = result.exitCode;
}
