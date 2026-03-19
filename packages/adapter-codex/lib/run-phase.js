#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  bootstrapCodexRole,
  getCodexRoleBundleIntake,
} = require('./codex-adapter');

function usage() {
  console.error(
    'Usage: run-phase.js --phase <extract|curate> --date <YYYY-MM-DD> --memory-root <path> --role-id <id> --workspace-dir <path> --system-root <path> --shared-skills-root <path> --install-date <date> --llm-runner <cmd> --sandbox <mode> [--source-glob <hint>] [--model <model>] [--profile <profile>]'
  );
}

function parseArgs(argv) {
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      throw new Error(`unexpected argument: ${arg}`);
    }

    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`missing value for --${key}`);
    }

    flags[key] = value;
    index += 1;
  }

  return flags;
}

function requireFlag(flags, key) {
  if (flags[key] == null || flags[key] === '') {
    throw new Error(`--${key} is required`);
  }

  return flags[key];
}

function buildBundleSummary(intake) {
  return intake.files.map((filePath) => `- ${filePath}`).join('\n');
}

function buildExtractPrompt(options = {}) {
  return `You are the MemoryOS extractor running through adapter-codex.

Operate from the attached role workspace at ${options.workspaceDir}.
Start by reading BOOT.md, then read ${options.runbookPath} and follow Phase A only.

Task:
- batch date: ${options.date}
- source inputs contract: ${options.sourceGlob}
- write or resume: ${options.pendingBatchPath}
- treat ${options.processedBatchPath} as the already-processed marker for this date

Role bundle files available in this workspace:
${buildBundleSummary(options.intake)}

Required behavior:
- work source-first and use only observations provided for the requested date
- do not assume OpenClaw session paths or OpenClaw skill wiring
- do not compare against canon during extract
- do not add curator annotations
- do not write canonical records
- do not update manifest, graph, or other core/meta files
- only create or update ${options.pendingBatchPath}
- if the batch already exists, resume in place and continue deterministic claim numbering

When finished, print a short summary including the batch path and claim count.`;
}

function buildCuratePrompt(options = {}) {
  return `You are the MemoryOS curator running through adapter-codex.

Operate from the attached role workspace at ${options.workspaceDir}.
Start by reading BOOT.md, then read ${options.runbookPath} and follow Phase B only.

Task:
- batch date: ${options.date}
- review: ${options.pendingBatchPath}
- compare only against relevant canon slices under ${options.memoryPath}

Role bundle files available in this workspace:
${buildBundleSummary(options.intake)}

Required behavior:
- annotate every claim with exactly one "### curator-annotation" block
- allowed decisions are accept, reject, or defer
- accepted claims must include target_type, target_file, draft_record_id, and draft_summary
- do not reopen raw source files during curation
- do not write canonical records
- do not update manifest, graph, or other core/meta files
- only update the intake batch so it is ready for the core promoter handoff path

When finished, print a short summary including the batch path and the number of claims reviewed.`;
}

function buildPhasePrompt(options = {}) {
  if (options.phase === 'extract') {
    return buildExtractPrompt(options);
  }

  return buildCuratePrompt(options);
}

function runCodexPhase(flags) {
  const phase = requireFlag(flags, 'phase');
  const date = requireFlag(flags, 'date');

  if (!['extract', 'curate'].includes(phase)) {
    throw new Error(`unsupported phase: ${phase}`);
  }

  const workspaceDir = path.resolve(requireFlag(flags, 'workspace-dir'));
  const systemRoot = path.resolve(requireFlag(flags, 'system-root'));
  const memoryRoot = path.resolve(requireFlag(flags, 'memory-root'));
  const sharedSkillsRoot = path.resolve(requireFlag(flags, 'shared-skills-root'));
  const roleId = requireFlag(flags, 'role-id');
  const installDate = requireFlag(flags, 'install-date');
  const llmRunner = requireFlag(flags, 'llm-runner');
  const sandbox = requireFlag(flags, 'sandbox');
  const sourceGlob = flags['source-glob'] || 'adapter-provided observations for the requested date';
  const model = flags.model || '';
  const profile = flags.profile || '';

  bootstrapCodexRole({
    roleId,
    workspaceDir,
    systemRoot,
    memoryRoot,
    sharedSkillsRoot,
    installDate,
  });

  const intake = getCodexRoleBundleIntake({
    roleId,
    workspaceDir,
    systemRoot,
    memoryRoot,
    sharedSkillsRoot,
    installDate,
  });
  const memoryPath = intake.memoryPath;
  const runbookPath = `${memoryPath}/core/system/curator-runbook.md`;
  const pendingBatchPath = `${memoryPath}/intake/pending/${date}.md`;
  const processedBatchPath = `${memoryPath}/intake/processed/${date}.md`;
  const prompt = buildPhasePrompt({
    date,
    intake,
    memoryPath,
    pendingBatchPath,
    phase,
    processedBatchPath,
    runbookPath,
    sourceGlob,
    workspaceDir,
  });

  const args = [
    'exec',
    '--skip-git-repo-check',
    '--cd',
    workspaceDir,
  ];
  if (sandbox === 'workspace-write') {
    args.splice(2, 0, '--full-auto');
  } else {
    args.splice(2, 0, '--sandbox', sandbox);
  }
  if (profile) {
    args.push('--profile', profile);
  }
  if (model) {
    args.push('--model', model);
  }
  args.push('-');

  const result = spawnSync(llmRunner, args, {
    cwd: workspaceDir,
    input: prompt,
    stdio: ['pipe', 'inherit', 'inherit'],
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status == null ? 1 : result.status;
}

function main(argv) {
  let flags;
  try {
    flags = parseArgs(argv);
  } catch (error) {
    console.error(`error: ${error.message}`);
    usage();
    return 2;
  }

  try {
    return runCodexPhase(flags);
  } catch (error) {
    console.error(`error: ${error.message}`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
