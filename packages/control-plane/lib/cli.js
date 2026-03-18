'use strict';

const { getControlPlaneAnalytics } = require('./analytics');
const { getControlPlaneAudits } = require('./audit');
const { getControlPlaneHealth } = require('./health');
const {
  getControlPlaneInterventions,
  recordControlPlaneIntervention,
} = require('./interventions');
const { getControlPlaneQueues } = require('./queues');
const { getControlPlaneRuntimeInspector } = require('./runtime-inspector');
const { getControlPlaneSnapshot } = require('./snapshot');

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

function printUsage() {
  console.error('Usage: memory-control-plane <command> [options]');
  console.error('Commands:');
  console.error('  analytics --memory-root <path> [--system-root <path>] [--runtime-limit <n>] [--skip-verify] [--updated-at <ts>] [--today <date>] [--runtime-stale-after-days <n>]');
  console.error('  audit --memory-root <path> [--runtime-limit <n>] [--skip-verify] [--updated-at <ts>] [--today <date>] [--audit-limit <n>] [--stale-after-days <n>] [--runtime-stale-after-days <n>]');
  console.error('  audits --memory-root <path> [--runtime-limit <n>] [--skip-verify] [--updated-at <ts>] [--today <date>] [--audit-limit <n>] [--stale-after-days <n>] [--runtime-stale-after-days <n>]');
  console.error('  snapshot --memory-root <path> [--system-root <path>] [--runtime-limit <n>] [--skip-verify] [--updated-at <ts>] [--today <date>] [--runtime-stale-after-days <n>] [--audit-limit <n>] [--stale-after-days <n>]');
  console.error('  health --memory-root <path> [--system-root <path>] [--runtime-limit <n>] [--skip-verify] [--updated-at <ts>] [--today <date>] [--runtime-stale-after-days <n>] [--audit-limit <n>] [--stale-after-days <n>]');
  console.error('  queues --memory-root <path> [--skip-verify] [--updated-at <ts>] [--today <date>]');
  console.error('  interventions --memory-root <path>');
  console.error('  runtime-inspector --memory-root <path> [--runtime-limit <n>] [--updated-at <ts>] [--today <date>] [--runtime-stale-after-days <n>]');
  console.error('  record-intervention --memory-root <path> --action <id> --target-kind <proposal|job|conflict|lock> [--proposal-id <id>] [--job-id <id>] [--conflict-code <code>] [--lock-path <path>] [--relative-path <path>] [--note <text>] [--actor <id>] [--status <requested|acknowledged|resolved>] [--intervention-id <id>]');
}

function runCli(argv) {
  const { command, flags } = parseArgv(argv);

  if (!command || command === 'help' || command === '--help') {
    printUsage();
    return 1;
  }

  const options = {
    memoryRoot: requireFlag(flags, 'memory-root'),
    systemRoot: flags['system-root'],
    runtimeLimit: flags['runtime-limit'],
    runtimeStaleAfterDays: flags['runtime-stale-after-days'],
    auditLimit: flags['audit-limit'],
    staleAfterDays: flags['stale-after-days'],
    skipVerify: flags['skip-verify'] === true,
    updatedAt: flags['updated-at'],
    today: flags.today,
  };

  let result;

  switch (command) {
    case 'snapshot':
      result = getControlPlaneSnapshot(options);
      break;
    case 'health':
      result = getControlPlaneHealth(options);
      break;
    case 'analytics':
      result = getControlPlaneAnalytics(options);
      break;
    case 'audit':
    case 'audits':
      result = getControlPlaneAudits(options);
      break;
    case 'queues':
      result = getControlPlaneQueues(options);
      break;
    case 'interventions':
      result = getControlPlaneInterventions(options);
      break;
    case 'runtime-inspector':
      result = getControlPlaneRuntimeInspector(options);
      break;
    case 'record-intervention':
      result = recordControlPlaneIntervention({
        memoryRoot: options.memoryRoot,
        interventionId: flags['intervention-id'],
        action: requireFlag(flags, 'action'),
        targetKind: requireFlag(flags, 'target-kind'),
        proposalId: flags['proposal-id'],
        jobId: flags['job-id'],
        conflictCode: flags['conflict-code'],
        lockPath: flags['lock-path'],
        relativePath: flags['relative-path'],
        note: flags.note,
        actor: flags.actor,
        status: flags.status,
        requestedAt: flags['requested-at'],
        updatedAt: flags['updated-at'],
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
