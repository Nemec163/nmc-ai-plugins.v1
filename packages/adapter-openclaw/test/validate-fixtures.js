"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { captureRuntime } = require("../../memory-os-gateway");

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
  completeOpenClawHandoff,
  createOpenClawPipelineAdapter,
  createOpenClawPlugin,
  createOpenClawConformanceAdapter,
  createOpenClawOrchestrationAdapter,
  getBundledSkillsRoot,
  getOpenClawOrchestrationContext,
  getOpenClawRecallBundle,
  maybeAutoSetup,
  proposeOpenClawResults,
  recordOpenClawFeedback,
  runSetupCli,
  setupOpenClaw,
} = require("..");

const PLUGIN_ROOT = path.resolve(__dirname, "../../../nmc-memory-plugin");
const ADAPTER_SKILLS_ROOT = getBundledSkillsRoot();
const PLUGIN_SETUP_MODULE_PATH = path.join(PLUGIN_ROOT, "lib", "openclaw-setup.js");
const PLUGIN_SETUP_SCRIPT_PATH = path.join(PLUGIN_ROOT, "scripts", "setup-openclaw.js");
const SHIPPED_ADAPTER_SETUP_MODULE_PATH = path.join(
  PLUGIN_ROOT,
  "packages",
  "adapter-openclaw",
  "lib",
  "openclaw-setup.js",
);

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
  const pluginShell = require(PLUGIN_ROOT);
  const pluginSetupModule = require(PLUGIN_SETUP_MODULE_PATH);
  const shippedAdapterSetupModule = require(SHIPPED_ADAPTER_SETUP_MODULE_PATH);
  assert.equal(plugin.id, PLUGIN_ID);
  assert.equal(plugin.name, "NMC Memory Plugin");
  assert.equal(pluginShell.id, plugin.id);
  assert.equal(pluginShell.name, plugin.name);
  assert.deepEqual(
    Object.keys(pluginSetupModule).sort(),
    Object.keys(shippedAdapterSetupModule).sort(),
  );
  assert.equal(pluginSetupModule.PLUGIN_ID, PLUGIN_ID);
  assert.equal(typeof pluginSetupModule.setupOpenClaw, "function");
  assert.equal(typeof pluginSetupModule.maybeAutoSetup, "function");

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
  const shellCliHelp = spawnSync(
    process.execPath,
    [PLUGIN_SETUP_SCRIPT_PATH, "--help"],
    {
      cwd: PLUGIN_ROOT,
      encoding: "utf8",
    },
  );
  assert.equal(shellCliHelp.status, 0);
  assert.equal(shellCliHelp.stdout, cliHelp.stdout);
  assert.equal(shellCliHelp.stderr, "");

  const pipelineAdapter = createOpenClawPipelineAdapter();
  assert.deepEqual(pipelineAdapter.runExtract({
    date: "2026-03-18",
    llmRunner: "openclaw",
  }), {
    command: "openclaw",
    args: ["skill", "run", "memory-extract", "--date", "2026-03-18"],
  });

  const orchestrationRoot = makeTempRoot();
  try {
    const orchestrationWorkspaceRoot = path.join(orchestrationRoot, "workspace");
    fs.cpSync(
      path.resolve(__dirname, "../../../nmc-memory-plugin/tests/fixtures/workspace"),
      orchestrationWorkspaceRoot,
      { recursive: true },
    );

    captureRuntime({
      memoryRoot: orchestrationWorkspaceRoot,
      runId: "openclaw-2026-03-18-001",
      source: "adapter-openclaw-test",
      capturedAt: "2026-03-18T12:00:00Z",
      artifacts: {
        episodic: [
          {
            id: "ep-openclaw-001",
            summary: "OpenClaw runtime observed a repeat current-state question.",
          },
        ],
        retrievalTraces: [
          {
            id: "rt-openclaw-001",
            summary: "OpenClaw orchestration pulled canon current plus runtime shadow.",
          },
        ],
      },
      runtimeInputs: [
        {
          kind: "session",
          sourceSession: "openclaw-2026-03-18-001",
        },
      ],
    });

    const context = getOpenClawOrchestrationContext({
      memoryRoot: orchestrationWorkspaceRoot,
      roleId: "mnemo",
      installDate: "2026-03-18",
      limit: 5,
      text: "What is the current approach on volatile mornings?",
    });
    assert.equal(context.kind, "openclaw-orchestration-context");
    assert.equal(context.authoritative, false);
    assert.equal(context.roleBundle.manifest.id, "mnemo");
    assert.equal(context.runtime.buckets.retrievalTraces.entries[0].id, "rt-openclaw-001");
    assert.equal(context.maintainer.boardDefaultsPath.endsWith("system/tasks/active/.kanban.json"), true);

    const recall = getOpenClawRecallBundle({
      memoryRoot: orchestrationWorkspaceRoot,
      roleId: "mnemo",
      installDate: "2026-03-18",
      text: "What is the current approach on volatile mornings?",
    });
    assert.equal(recall.kind, "openclaw-orchestration-context");
    assert.equal(recall.freshnessBoundary.runtimeAuthoritative, false);

    const orchestrationAdapter = createOpenClawOrchestrationAdapter();
    const bundle = orchestrationAdapter.getRecallBundle({
      memoryRoot: orchestrationWorkspaceRoot,
      roleId: "mnemo",
      installDate: "2026-03-18",
      text: "What is the current approach on volatile mornings?",
    });
    assert.equal(orchestrationAdapter.authoritative, false);
    assert.equal(bundle.freshnessBoundary.runtimeAuthoritative, false);
    assert.equal(bundle.roleBundle.manifest.id, "mnemo");

    const submission = proposeOpenClawResults({
      memoryRoot: orchestrationWorkspaceRoot,
      batchDate: "2026-03-18",
      proposalId: "proposal-2026-03-18-openclaw-fixture",
      claims: [
        {
          claim_id: "claim-20260318-oc-001",
          source_session: "openclaw-2026-03-18-001",
          source_agent: "mnemo",
          observed_at: "2026-03-18T12:00:00Z",
          confidence: "high",
          tags: ["memory", "openclaw"],
          target_layer: "L3",
          target_domain: "work",
          claim: "OpenClaw runtime-backed orchestration should stop at gateway-mediated handoff.",
        },
      ],
    });
    assert.equal(submission.status, "proposed");

    const review = recordOpenClawFeedback({
      memoryRoot: orchestrationWorkspaceRoot,
      proposalId: submission.proposalId,
      feedback: [
        {
          claim_id: "claim-20260318-oc-001",
          curator_decision: "accept",
          curator_notes: "Approved through adapter-openclaw orchestration helper.",
          actor: "adapter-openclaw-test",
        },
      ],
    });
    assert.equal(review.status, "ready-for-apply");

    const completion = completeOpenClawHandoff({
      memoryRoot: orchestrationWorkspaceRoot,
      proposalId: submission.proposalId,
      holder: "adapter-openclaw-test",
    });
    assert.equal(completion.status, "ready-for-handoff");
    assert.equal(
      completion.receipt.write_path.promotion_request.operation,
      "core-promoter",
    );
  } finally {
    fs.rmSync(orchestrationRoot, { recursive: true, force: true });
  }

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
