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

const COMPATIBILITY_SHELL_CONTRACTS = Object.freeze([
  'openclaw nmc-memory setup',
  'plugin auto-bootstrap',
  'openclaw.plugin.json',
  'system workspace layout',
]);

function buildCheck(name, ok, detail) {
  return {
    name,
    ok,
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
    compatibilityShell: {
      package: 'nmc-memory-plugin',
      status: 'compatibility-only-shell',
      productionStatus: 'current-production-install-shell',
      directAdapterInstall: 'not-supported',
      preservedContracts: COMPATIBILITY_SHELL_CONTRACTS,
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
