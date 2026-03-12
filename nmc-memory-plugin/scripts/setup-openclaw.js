#!/usr/bin/env node
"use strict";

const path = require("path");

const {
  printSummary,
  setupOpenClaw,
} = require("../lib/openclaw-setup");

function usage() {
  console.error(
    [
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
    ].join("\n"),
  );
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

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`error: ${error.message}`);
    usage();
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    usage();
    return;
  }

  const pluginRoot = path.resolve(__dirname, "..");

  try {
    const result = setupOpenClaw({
      pluginRoot,
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

    console.log(printSummary(result));
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
