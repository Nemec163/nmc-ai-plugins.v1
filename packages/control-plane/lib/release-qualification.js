'use strict';

const SUPPORTED_CONTROL_PLANE_COMMANDS = Object.freeze([
  'snapshot',
  'health',
  'queues',
  'analytics',
  'audits',
  'interventions',
  'runtime-inspector',
  'record-intervention',
]);

const DIRECT_ADAPTER_CONTRACTS = Object.freeze([
  'openclaw memoryos setup',
  'plugin auto-bootstrap',
  'openclaw.plugin.json',
  'system workspace layout',
]);

const STANDALONE_APP_CONTRACTS = Object.freeze([
  'memoryos init',
  'memoryos run',
  'standalone system workspace bootstrap',
  'system workspace layout',
  'canon promotion boundary',
]);

const PACKAGE_MATRIX = Object.freeze([
  {
    package: 'memoryos-app',
    layer: 'app',
    status: 'production',
    surface: 'supported-standalone-app-surface',
  },
  {
    package: '@nmc/memory-contracts',
    layer: 'core',
    status: 'internal',
    surface: 'shared-contract-package',
  },
  {
    package: '@nmc/memory-ingest',
    layer: 'core',
    status: 'internal',
    surface: 'shared-ingest-package',
  },
  {
    package: '@nmc/memory-canon',
    layer: 'core',
    status: 'internal',
    surface: 'shared-canon-package',
  },
  {
    package: '@nmc/memory-maintainer',
    layer: 'core',
    status: 'internal',
    surface: 'shared-maintainer-package',
  },
  {
    package: '@nmc/memory-workspace',
    layer: 'core',
    status: 'internal',
    surface: 'shared-workspace-package',
  },
  {
    package: '@nmc/memory-agents',
    layer: 'core',
    status: 'internal',
    surface: 'shared-agent-package',
  },
  {
    package: '@nmc/memory-pipeline',
    layer: 'core',
    status: 'internal',
    surface: 'shared-pipeline-package',
  },
  {
    package: '@nmc/memory-scripts',
    layer: 'core',
    status: 'internal',
    surface: 'shared-script-package',
  },
  {
    package: 'memory-os-runtime',
    layer: 'core',
    status: 'internal',
    surface: 'runtime-shadow-package',
  },
  {
    package: 'memory-os-gateway',
    layer: 'gateway',
    status: 'production',
    surface: 'supported-programmatic-surface',
  },
  {
    package: 'control-plane',
    layer: 'operator',
    status: 'production',
    surface: 'supported-operator-surface',
  },
  {
    package: 'adapter-openclaw',
    layer: 'connector',
    status: 'production',
    surface: 'supported-direct-install-surface',
  },
  {
    package: 'adapter-codex',
    layer: 'connector',
    status: 'bounded',
    surface: 'bounded-connector-surface',
  },
  {
    package: 'adapter-claude',
    layer: 'connector',
    status: 'bounded',
    surface: 'bounded-connector-surface',
  },
  {
    package: 'adapter-conformance',
    layer: 'test',
    status: 'internal',
    surface: 'test-only-conformance-harness',
  },
]);

function buildCheck(name, ok, detail) {
  return {
    name,
    ok,
    detail,
  };
}

function buildRetirementGate(id, status, detail) {
  return {
    id,
    status,
    detail,
  };
}

function getControlPlaneReleaseQualification(snapshot) {
  const checks = [
    buildCheck(
      'supported-operator-surface',
      snapshot.operatorSurface.readOnly === true,
      snapshot.operatorSurface.readOnly
        ? 'control-plane remains read-only'
        : 'control-plane widened beyond read-only scope'
    ),
    buildCheck(
      'handoff-contract-owner',
      snapshot.operatorSurface.handoffVisibility === 'control-plane-owned',
      snapshot.operatorSurface.handoffVisibility
    ),
    buildCheck(
      'scheduler-boundary',
      snapshot.operatorSurface.schedulerOwnedBy === '@nmc/memory-maintainer' &&
        snapshot.operatorSurface.backlogPolicyOwnedBy === '@nmc/memory-maintainer',
      `${snapshot.operatorSurface.schedulerOwnedBy} / ${snapshot.operatorSurface.backlogPolicyOwnedBy}`
    ),
    buildCheck(
      'promotion-boundary',
      snapshot.operatorSurface.promotionOwnedBy === '@nmc/memory-canon',
      snapshot.operatorSurface.promotionOwnedBy
    ),
    buildCheck(
      'runtime-boundary',
      snapshot.operatorSurface.runtimeAuthoritative === false &&
        snapshot.runtime.authoritative === false,
      snapshot.runtime.authoritative
        ? 'runtime became authoritative'
        : 'runtime remains non-authoritative'
    ),
    buildCheck(
      'manual-intervention-mode',
      snapshot.operatorSurface.manualInterventions === 'advisory-receipts',
      snapshot.operatorSurface.manualInterventions
    ),
  ];

  const retirementGates = [];

  return {
    kind: 'control-plane-release-qualification',
    schemaVersion: '1.0',
    qualified: checks.every((check) => check.ok),
    supportedSurface: {
      package: 'control-plane',
      cli: 'memory-control-plane',
      status: 'supported-migration-release-surface',
      commands: SUPPORTED_CONTROL_PLANE_COMMANDS,
    },
    standaloneAppSurface: {
      package: 'memoryos-app',
      cli: 'memoryos',
      status: 'supported-standalone-app-surface',
      preservedContracts: STANDALONE_APP_CONTRACTS,
    },
    directAdapterSurface: {
      package: 'adapter-openclaw',
      pluginId: 'memoryos-openclaw',
      cli: 'memoryos',
      status: 'supported-direct-install-surface',
      preservedContracts: DIRECT_ADAPTER_CONTRACTS,
    },
    legacyShell: {
      package: 'nmc-memory-plugin',
      status: 'retired',
      productionStatus: 'retired',
      directAdapterInstall: 'not-supported',
      removedFromRepository: true,
    },
    packageMatrix: {
      source: 'control-plane-release-qualification',
      packageCount: PACKAGE_MATRIX.length,
      entries: PACKAGE_MATRIX,
    },
    retirementPrerequisites: {
      target: 'nmc-memory-plugin-legacy-retirement',
      cutoverReady: retirementGates.every((gate) => gate.status === 'cleared'),
      pendingGateCount: retirementGates.filter((gate) => gate.status !== 'cleared').length,
      gates: retirementGates,
    },
    bridgeStatus: {
      gatewayOpsSnapshot: 'retired',
      supportedReplacement: 'control-plane',
      replacementCommands: [
        'snapshot',
        'queues',
        'health',
        'analytics',
        'audits',
        'runtime-inspector',
      ],
    },
    checks,
  };
}

module.exports = {
  getControlPlaneReleaseQualification,
};
