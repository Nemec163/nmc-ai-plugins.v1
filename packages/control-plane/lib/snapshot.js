'use strict';

const { loadGateway } = require('./load-deps');
const { getControlPlaneInterventions } = require('./interventions');
const { getMaintainerSnapshot } = require('./maintainer');
const { resolveMemoryRoot, resolveSystemRoot } = require('./paths');
const { getControlPlaneQueues } = require('./queues');

function readSection(readFn) {
  try {
    return {
      ok: true,
      value: readFn(),
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        message: error.message,
      },
    };
  }
}

function getControlPlaneSnapshot(options = {}) {
  const memoryRoot = resolveMemoryRoot(options);
  const systemRoot = resolveSystemRoot(options, memoryRoot);
  const gateway = loadGateway();
  const statusSection = readSection(() => gateway.getStatus({ memoryRoot }));
  const healthSection = readSection(() => gateway.getHealth({ memoryRoot }));
  const verifySection = options.skipVerify
    ? { ok: true, value: null }
    : readSection(() =>
        gateway.verify({
          memoryRoot,
          updatedAt: options.updatedAt,
          today: options.today,
        })
      );
  const currentSection = readSection(() =>
    gateway.getCanonicalCurrent({
      memoryRoot,
    })
  );
  const queues = getControlPlaneQueues({
    memoryRoot,
    skipVerify: options.skipVerify,
    updatedAt: options.updatedAt,
    today: options.today,
    gatewaySections: {
      statusSection,
      healthSection,
      verifySection,
    },
  });
  const interventions = getControlPlaneInterventions({ memoryRoot });
  const maintainer = getMaintainerSnapshot({
    memoryRoot,
    systemRoot,
  });
  const runtimeDelta = gateway.getRuntimeDelta({
    memoryRoot,
    limit: options.runtimeLimit ? Number(options.runtimeLimit) : undefined,
  });

  return {
    kind: 'control-plane-snapshot',
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    memoryRoot,
    systemRoot,
    operatorSurface: {
      readOnly: true,
      runtimeAuthoritative: false,
      schedulerOwnedBy: '@nmc/memory-maintainer',
      backlogPolicyOwnedBy: '@nmc/memory-maintainer',
      promotionOwnedBy: '@nmc/memory-canon',
      handoffVisibility: 'control-plane-owned',
      manualInterventions: 'advisory-receipts',
    },
    gateway: {
      status: statusSection.ok
        ? statusSection.value
        : { status: 'error', error: statusSection.error.message },
      health: healthSection.ok
        ? healthSection.value
        : { status: 'error', error: healthSection.error.message },
      verify: verifySection.ok
        ? verifySection.value
        : { status: 'error', error: verifySection.error.message },
      current: currentSection.ok
        ? currentSection.value
        : { status: 'error', error: currentSection.error.message },
    },
    queues,
    handoff: {
      proposals: queues.proposals,
      jobs: queues.jobs,
      lock: queues.lock,
      conflicts: queues.conflicts.items,
      backlog: queues.backlog,
      degradedMode: queues.degradedMode,
    },
    interventions,
    runtime: {
      authoritative: false,
      delta: runtimeDelta,
    },
    maintainer,
  };
}

module.exports = {
  getControlPlaneSnapshot,
  get_control_plane_snapshot: getControlPlaneSnapshot,
  snapshot: getControlPlaneSnapshot,
};
