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
  INSTALL_SURFACES,
  PLUGIN_ID,
  PLUGIN_NAME,
  completeOpenClawHandoff,
  createOpenClawConformanceAdapter,
  createOpenClawOrchestrationAdapter,
  createOpenClawPackageMetadata,
  createOpenClawPipelineAdapter,
  createOpenClawPlugin,
  createOpenClawPluginManifest,
  getBundledSkillsRoot,
  getOpenClawOrchestrationContext,
  getOpenClawRecallBundle,
  maybeAutoSetup,
  proposeOpenClawResults,
  recordOpenClawFeedback,
  runSetupCli,
  setupOpenClaw,
} = require("..");

const ADAPTER_ROOT = path.resolve(__dirname, "..");
const ADAPTER_SKILLS_ROOT = getBundledSkillsRoot();
const ADAPTER_MANIFEST_PATH = path.join(ADAPTER_ROOT, "openclaw.plugin.json");
const ADAPTER_PACKAGE_FILE = path.join(ADAPTER_ROOT, "package.json");
const ADAPTER_PLUGIN_ENTRY_PATH = path.join(ADAPTER_ROOT, "plugin.js");
const ADAPTER_SETUP_SCRIPT_PATH = path.join(ADAPTER_ROOT, "lib", "setup-cli.js");
const WORKSPACE_FIXTURE = path.resolve(__dirname, "../../../tests/fixtures/workspace");

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
  assert.deepEqual(listSkillNames(ADAPTER_SKILLS_ROOT), [
    "kanban-operator",
    "memory-apply",
    "memory-curate",
    "memory-extract",
    "memory-onboard-agent",
    "memory-pipeline",
    "memory-query",
    "memory-retention",
    "memory-status",
    "memory-verify",
  ]);

  for (const skillName of listSkillNames(ADAPTER_SKILLS_ROOT)) {
    const adapterSkillRoot = path.join(ADAPTER_SKILLS_ROOT, skillName);

    assert.equal(
      fs.existsSync(path.join(adapterSkillRoot, "SKILL.md")),
      true,
      `Expected ${skillName} SKILL.md to exist`,
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

  for (const templateRoot of ["workspace-memory", "workspace-system"]) {
    const absoluteTemplateRoot = path.join(ADAPTER_ROOT, "templates", templateRoot);

    assert.equal(fs.existsSync(absoluteTemplateRoot), true);
    assert.notEqual(
      listRelativeFiles(absoluteTemplateRoot).length,
      0,
      `Expected ${templateRoot} to ship non-empty template content`,
    );
  }

  assert.deepEqual(
    readJson(ADAPTER_MANIFEST_PATH),
    createOpenClawPluginManifest(INSTALL_SURFACES.ADAPTER),
  );
  assert.deepEqual(
    readJson(ADAPTER_PACKAGE_FILE).openclaw,
    createOpenClawPackageMetadata(INSTALL_SURFACES.ADAPTER),
  );
  assert.equal(
    readJson(ADAPTER_PACKAGE_FILE).version,
    readJson(ADAPTER_MANIFEST_PATH).version,
  );

  const plugin = createOpenClawPlugin({
    pluginId: PLUGIN_ID,
    pluginName: PLUGIN_NAME,
    pluginRoot: ADAPTER_ROOT,
  });
  const directPlugin = require(ADAPTER_PLUGIN_ENTRY_PATH);

  assert.equal(plugin.id, PLUGIN_ID);
  assert.equal(plugin.name, PLUGIN_NAME);
  assert.equal(directPlugin.id, PLUGIN_ID);
  assert.equal(directPlugin.name, PLUGIN_NAME);

  const setupRoot = makeTempRoot();
  try {
    const stateDir = path.join(setupRoot, "state");
    const result = setupOpenClaw({
      pluginRoot: ADAPTER_ROOT,
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
    assert.equal(fs.lstatSync(sharedPipelinePath).isSymbolicLink(), true);
    assert.equal(
      path.resolve(path.dirname(sharedPipelinePath), fs.readlinkSync(sharedPipelinePath)),
      path.join(ADAPTER_SKILLS_ROOT, "memory-pipeline"),
    );

    const rerun = setupOpenClaw({
      pluginRoot: ADAPTER_ROOT,
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
      ADAPTER_ROOT,
    );

    assert.equal(autoSetupResult.stateDir, stateDir);
    assert.equal(fs.existsSync(path.join(stateDir, "openclaw.json")), true);
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }

  const cliHelp = runSetupCli(["--help"], ADAPTER_ROOT);
  assert.equal(cliHelp.exitCode, 0);
  assert.match(cliHelp.stdout, /Usage: node \.\/packages\/adapter-openclaw\/lib\/setup-cli\.js/);
  const shellCliHelp = spawnSync(
    process.execPath,
    [ADAPTER_SETUP_SCRIPT_PATH, "--help"],
    {
      cwd: ADAPTER_ROOT,
      encoding: "utf8",
    },
  );
  assert.equal(shellCliHelp.status, 0);
  assert.equal(shellCliHelp.stdout, cliHelp.stdout);
  assert.equal(shellCliHelp.stderr, "");

  const pipelineAdapter = createOpenClawPipelineAdapter();
  assert.deepEqual(
    pipelineAdapter.runExtract({
      date: "2026-03-18",
      llmRunner: "openclaw",
    }),
    {
      command: "openclaw",
      args: ["skill", "run", "memory-extract", "--date", "2026-03-18"],
    },
  );

  const orchestrationRoot = makeTempRoot();
  try {
    const orchestrationWorkspaceRoot = path.join(orchestrationRoot, "workspace");
    fs.cpSync(WORKSPACE_FIXTURE, orchestrationWorkspaceRoot, { recursive: true });

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
    assert.equal(
      context.maintainer.boardDefaultsPath.endsWith("system/tasks/active/.kanban.json"),
      true,
    );

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
      pluginRoot: ADAPTER_ROOT,
    }),
    fixture: {
      installDate: "2026-03-18",
      memoryRoot: WORKSPACE_FIXTURE,
      workspaceFixture: WORKSPACE_FIXTURE,
      expectedBacklogAlert: false,
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
    "Validated adapter-openclaw setup, auto-bootstrap, orchestration handoff, and shared conformance fixtures.",
  );
}

main();
