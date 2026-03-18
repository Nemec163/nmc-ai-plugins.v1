'use strict';

const fs = require('node:fs');

const {
  bootstrapRole,
  bootstrapWorkspace,
  getRoleBundle,
} = require('./bootstrap');
const { getHealth } = require('./health');
const { query } = require('./query');
const {
  captureRuntime,
  getRuntimeDelta,
  getRuntimeRecallBundle,
} = require('./runtime');
const {
  getCanonicalCurrent,
  getProjection,
  readRecord,
} = require('./read');
const { getRecallBundle } = require('./recall');
const { getOpsSnapshot } = require('./ops');
const { getStatus } = require('./status');
const { verify } = require('./verify');
const { completeJob, feedback, propose } = require('./write');

function parseArgv(argv) {
  const positional = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }

  return {
    command: positional[0] || '',
    flags,
  };
}

function requireFlag(flags, key) {
  if (flags[key] == null || flags[key] === '') {
    throw new Error(`--${key} is required`);
  }

  return flags[key];
}

function toBoolean(value) {
  if (value === true) {
    return true;
  }

  return String(value || '').toLowerCase() === 'true';
}

function printUsage() {
  console.error('Usage: memory-os-gateway <command> [options]');
  console.error('Commands:');
  console.error('  read-record --memory-root <path> --record-id <id>');
  console.error('  get-projection --memory-root <path> --projection-path <path>');
  console.error('  get-canonical-current --memory-root <path>');
  console.error('  get-role-bundle --role-id <id> [--install-date <date>] [--memory-path <path>] [--system-path <path>]');
  console.error('  get-recall-bundle --memory-root <path> [--role-id <id>] [--install-date <date>] [--memory-path <path>] [--system-path <path>] [--text <query>] [--limit <n>] [--include-pending]');
  console.error('  bootstrap-role --role-id <id> --workspace-dir <path> --shared-skills-root <path> --system-root <path> --memory-root <path> [--state-dir <path>] [--install-date <date>] [--overwrite]');
  console.error('  bootstrap-workspace --state-dir <path> --workspace-root <path> --system-root <path> --memory-root <path> --system-template-root <path> --memory-template-root <path> --skills-source-root <path> [--shared-skills-root <path>] [--install-date <date>] [--overwrite]');
  console.error('  query --memory-root <path> --text <query> [--limit <n>] [--include-pending]');
  console.error('  get-runtime-delta --memory-root <path> [--limit <n>]');
  console.error('  get-runtime-recall-bundle --memory-root <path> [--text <query>] [--limit <n>]');
  console.error('  capture-runtime --memory-root <path> --run-id <id> --artifacts-file <path> [--runtime-inputs-file <path>] [--source <label>] [--captured-at <ts>] [--overwrite]');
  console.error('  status --memory-root <path>');
  console.error('  verify --memory-root <path> [--updated-at <ts>] [--today <date>]');
  console.error('  health --memory-root <path>');
  console.error('  ops-snapshot --memory-root <path> [--skip-verify] [--updated-at <ts>] [--today <date>]  # compatibility-only bridge; use memory-control-plane');
  console.error('  propose --memory-root <path> --batch-date <date> --claims-file <path> [--proposal-id <id>] [--source <label>]');
  console.error('  feedback --memory-root <path> --proposal-id <id> --feedback-file <path>');
  console.error('  complete-job --memory-root <path> --proposal-id <id> [--job-id <id>] [--holder <id>] [--operation <name>]');
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runCli(argv) {
  const { command, flags } = parseArgv(argv);

  if (!command || command === 'help' || command === '--help') {
    printUsage();
    return 1;
  }

  let result;

  switch (command) {
    case 'read-record':
      result = readRecord({
        memoryRoot: requireFlag(flags, 'memory-root'),
        recordId: requireFlag(flags, 'record-id'),
      });
      break;
    case 'get-projection':
      result = getProjection({
        memoryRoot: requireFlag(flags, 'memory-root'),
        projectionPath: requireFlag(flags, 'projection-path'),
      });
      break;
    case 'get-canonical-current':
      result = getCanonicalCurrent({
        memoryRoot: requireFlag(flags, 'memory-root'),
      });
      break;
    case 'get-role-bundle':
      result = getRoleBundle({
        roleId: requireFlag(flags, 'role-id'),
        installDate: flags['install-date'],
        memoryPath: flags['memory-path'],
        systemPath: flags['system-path'],
      });
      break;
    case 'get-recall-bundle':
      result = getRecallBundle({
        memoryRoot: requireFlag(flags, 'memory-root'),
        roleId: flags['role-id'],
        installDate: flags['install-date'],
        memoryPath: flags['memory-path'],
        systemPath: flags['system-path'],
        limit: flags.limit ? Number(flags.limit) : undefined,
        text: flags.text,
        includePending: flags['include-pending'] === true ? true : undefined,
      });
      break;
    case 'bootstrap-role':
      result = bootstrapRole({
        roleId: requireFlag(flags, 'role-id'),
        workspaceDir: requireFlag(flags, 'workspace-dir'),
        sharedSkillsRoot: requireFlag(flags, 'shared-skills-root'),
        systemRoot: requireFlag(flags, 'system-root'),
        memoryRoot: requireFlag(flags, 'memory-root'),
        stateDir: flags['state-dir'],
        installDate: flags['install-date'],
        overwrite: toBoolean(flags.overwrite),
      });
      break;
    case 'bootstrap-workspace':
      result = bootstrapWorkspace({
        stateDir: requireFlag(flags, 'state-dir'),
        workspaceRoot: requireFlag(flags, 'workspace-root'),
        systemRoot: requireFlag(flags, 'system-root'),
        memoryRoot: requireFlag(flags, 'memory-root'),
        systemTemplateRoot: requireFlag(flags, 'system-template-root'),
        memoryTemplateRoot: requireFlag(flags, 'memory-template-root'),
        skillsSourceRoot: requireFlag(flags, 'skills-source-root'),
        sharedSkillsRoot: flags['shared-skills-root'],
        installDate: flags['install-date'],
        overwrite: toBoolean(flags.overwrite),
      });
      break;
    case 'query':
      result = query({
        memoryRoot: requireFlag(flags, 'memory-root'),
        text: requireFlag(flags, 'text'),
        limit: flags.limit ? Number(flags.limit) : undefined,
        includePending: flags['include-pending'] === true ? true : undefined,
      });
      break;
    case 'get-runtime-delta':
      result = getRuntimeDelta({
        memoryRoot: requireFlag(flags, 'memory-root'),
        limit: flags.limit ? Number(flags.limit) : undefined,
      });
      break;
    case 'get-runtime-recall-bundle':
      result = getRuntimeRecallBundle({
        memoryRoot: requireFlag(flags, 'memory-root'),
        text: flags.text,
        limit: flags.limit ? Number(flags.limit) : undefined,
      });
      break;
    case 'capture-runtime':
      result = captureRuntime({
        memoryRoot: requireFlag(flags, 'memory-root'),
        runId: requireFlag(flags, 'run-id'),
        source: flags.source,
        capturedAt: flags['captured-at'],
        artifacts: readJsonFile(requireFlag(flags, 'artifacts-file')),
        runtimeInputs: flags['runtime-inputs-file']
          ? readJsonFile(flags['runtime-inputs-file'])
          : undefined,
        overwrite: toBoolean(flags.overwrite),
      });
      break;
    case 'status':
      result = getStatus({
        memoryRoot: requireFlag(flags, 'memory-root'),
      });
      break;
    case 'verify':
      result = verify({
        memoryRoot: requireFlag(flags, 'memory-root'),
        updatedAt: flags['updated-at'],
        today: flags.today,
      });
      break;
    case 'health':
      result = getHealth({
        memoryRoot: requireFlag(flags, 'memory-root'),
      });
      break;
    case 'ops-snapshot':
      result = getOpsSnapshot({
        memoryRoot: requireFlag(flags, 'memory-root'),
        skipVerify: flags['skip-verify'] === true,
        updatedAt: flags['updated-at'],
        today: flags.today,
      });
      break;
    case 'propose':
      result = propose({
        memoryRoot: requireFlag(flags, 'memory-root'),
        proposalId: flags['proposal-id'],
        batchDate: requireFlag(flags, 'batch-date'),
        claims: readJsonFile(requireFlag(flags, 'claims-file')),
        source: flags.source || null,
      });
      break;
    case 'feedback':
      result = feedback({
        memoryRoot: requireFlag(flags, 'memory-root'),
        proposalId: flags['proposal-id'],
        feedback: readJsonFile(requireFlag(flags, 'feedback-file')),
      });
      break;
    case 'complete-job':
      result = completeJob({
        memoryRoot: requireFlag(flags, 'memory-root'),
        proposalId: requireFlag(flags, 'proposal-id'),
        jobId: flags['job-id'],
        holder: flags.holder,
        operation: flags.operation,
      });
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }

  console.log(JSON.stringify(result, null, 2));
  return 0;
}

module.exports = {
  runCli,
};
