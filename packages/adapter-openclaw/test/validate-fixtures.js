"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function loadAdapterConformance() {
  try {
    return require("adapter-conformance");
  } catch (error) {
    if (
      error.code !== "MODULE_NOT_FOUND" ||
      !String(error.message || "").includes("adapter-conformance")
    ) {
      throw error;
    }

    return require("../../adapter-conformance");
  }
}

const { runAdapterConformanceSuite } = loadAdapterConformance();

const {
  PLUGIN_ID,
  createOpenClawPipelineAdapter,
  createOpenClawPlugin,
  createOpenClawConformanceAdapter,
  getBundledSkillsRoot,
  maybeAutoSetup,
  runSetupCli,
  setupOpenClaw,
} = require("..");

const PLUGIN_ROOT = path.resolve(__dirname, "../../../nmc-memory-plugin");
const ADAPTER_SKILLS_ROOT = getBundledSkillsRoot();

function listSkillNames(rootDir) {
  return fs
    .readdirSync(rootDir)
    .filter((entry) => fs.statSync(path.join(rootDir, entry)).isDirectory())
    .sort();
}

function listRelativeFiles(rootDir) {
  const relativeFiles = [];

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      for (const childPath of listRelativeFiles(entryPath)) {
        relativeFiles.push(path.join(entry.name, childPath));
      }
      continue;
    }

    relativeFiles.push(entry.name);
  }

  return relativeFiles.sort();
}

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "adapter-openclaw-validate-"));
}

function main() {
  assert.deepEqual(
    listSkillNames(ADAPTER_SKILLS_ROOT),
    listSkillNames(path.join(PLUGIN_ROOT, "skills")),
  );
  for (const skillName of listSkillNames(ADAPTER_SKILLS_ROOT)) {
    const adapterSkillRoot = path.join(ADAPTER_SKILLS_ROOT, skillName);
    const pluginSkillRoot = path.join(PLUGIN_ROOT, "skills", skillName);

    assert.deepEqual(
      listRelativeFiles(adapterSkillRoot),
      listRelativeFiles(pluginSkillRoot),
      `Expected ${skillName} asset file tree to match compatibility mirror`,
    );
    assert.equal(
      fs.readFileSync(path.join(adapterSkillRoot, "SKILL.md"), "utf8"),
      fs.readFileSync(path.join(pluginSkillRoot, "SKILL.md"), "utf8"),
      `Expected ${skillName} SKILL.md mirror to match adapter-owned asset`,
    );

    for (const relativeFile of listRelativeFiles(adapterSkillRoot).filter((file) =>
      file.endsWith(".sh"),
    )) {
      assert.notEqual(
        fs.statSync(path.join(adapterSkillRoot, relativeFile)).mode & 0o111,
        0,
        `Expected ${skillName}/${relativeFile} to stay executable`,
      );
    }
  }

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
    const sharedPipelinePath = path.join(
      stateDir,
      "workspace",
      "system",
      "skills",
      "memory-pipeline",
    );

    assert.equal(result.agents.length, 5);
    assert.equal(fs.existsSync(path.join(stateDir, "openclaw.json")), true);
    assert.equal(
      fs.existsSync(path.join(stateDir, "workspace", "system", "memory")),
      true,
    );
    assert.equal(
      fs.lstatSync(sharedPipelinePath).isSymbolicLink(),
      true,
    );
    assert.equal(
      path.resolve(path.dirname(sharedPipelinePath), fs.readlinkSync(sharedPipelinePath)),
      path.join(ADAPTER_SKILLS_ROOT, "memory-pipeline"),
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

  const pipelineAdapter = createOpenClawPipelineAdapter();
  assert.deepEqual(pipelineAdapter.runExtract({
    date: "2026-03-18",
    llmRunner: "openclaw",
  }), {
    command: "openclaw",
    args: ["skill", "run", "memory-extract", "--date", "2026-03-18"],
  });

  const conformance = runAdapterConformanceSuite({
    adapter: createOpenClawConformanceAdapter({
      pluginRoot: PLUGIN_ROOT,
    }),
    fixture: {
      installDate: "2026-03-18",
      memoryRoot: path.resolve(
        __dirname,
        "../../../nmc-memory-plugin/tests/fixtures/workspace",
      ),
      workspaceFixture: path.resolve(
        __dirname,
        "../../../nmc-memory-plugin/tests/fixtures/workspace",
      ),
    },
  });
  assert.deepEqual(conformance.capabilities, [
    "roleBundle",
    "bootstrapRole",
    "bootstrapWorkspace",
    "canonicalRead",
    "projectionRead",
    "status",
    "verify",
    "writeOrchestration",
    "cliStatus",
  ]);

  console.log(
    "Validated adapter-openclaw setup, auto-bootstrap, and shared conformance fixtures.",
  );
}

main();
