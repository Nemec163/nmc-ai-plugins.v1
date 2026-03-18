"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  PLUGIN_ID,
  createOpenClawPlugin,
  maybeAutoSetup,
  runSetupCli,
  setupOpenClaw,
} = require("..");

const PLUGIN_ROOT = path.resolve(__dirname, "../../../nmc-memory-plugin");

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "adapter-openclaw-validate-"));
}

function main() {
  const plugin = createOpenClawPlugin({
    pluginId: PLUGIN_ID,
    pluginName: "NMC Memory Plugin",
    pluginRoot: PLUGIN_ROOT,
  });
  assert.equal(plugin.id, PLUGIN_ID);
  assert.equal(plugin.name, "NMC Memory Plugin");

  const setupRoot = makeTempRoot();
  try {
    const stateDir = path.join(setupRoot, "state");
    const result = setupOpenClaw({
      pluginRoot: PLUGIN_ROOT,
      stateDir,
    });

    assert.equal(result.agents.length, 5);
    assert.equal(fs.existsSync(path.join(stateDir, "openclaw.json")), true);
    assert.equal(
      fs.existsSync(path.join(stateDir, "workspace", "system", "memory")),
      true,
    );

    const rerun = setupOpenClaw({
      pluginRoot: PLUGIN_ROOT,
      stateDir,
    });
    assert.equal(rerun.config.changed, false);
  } finally {
    fs.rmSync(setupRoot, { recursive: true, force: true });
  }

  const runtimeRoot = makeTempRoot();
  try {
    const stateDir = path.join(runtimeRoot, "state");
    const autoSetupResult = maybeAutoSetup(
      {
        config: {
          plugins: {
            entries: {
              [PLUGIN_ID]: {
                config: {
                  stateDir,
                },
              },
            },
          },
        },
      },
      PLUGIN_ROOT,
    );

    assert.equal(autoSetupResult.stateDir, stateDir);
    assert.equal(fs.existsSync(path.join(stateDir, "openclaw.json")), true);
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }

  const cliHelp = runSetupCli(["--help"], PLUGIN_ROOT);
  assert.equal(cliHelp.exitCode, 0);
  assert.match(cliHelp.stdout, /Usage: node scripts\/setup-openclaw\.js/);

  console.log(
    "Validated adapter-openclaw setup, auto-bootstrap, and CLI compatibility fixtures.",
  );
}

main();
