'use strict';

const path = require('node:path');

const NAMESPACE_SCHEMA_VERSION = '1.0';
const SINGLE_TENANT_NAMESPACE_MODE = 'single-tenant-default';
const SCOPED_NAMESPACE_MODE = 'scoped';

const DEFAULT_NAMESPACE_IDS = Object.freeze({
  tenantId: 'default',
  spaceId: 'default',
  userId: 'default',
  agentId: null,
  roleId: null,
});

function normalizeOptionalString(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeRequiredString(value, fallback, fieldName) {
  const normalized = normalizeOptionalString(value) || fallback;
  if (!normalized) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  return normalized;
}

function sanitizePathSegment(value, fieldName, fallback = 'default') {
  const normalized = normalizeOptionalString(value) || fallback;
  const sanitized = normalized
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!sanitized) {
    throw new Error(`${fieldName} must resolve to a safe path segment`);
  }

  return sanitized;
}

function buildNamespaceKey(namespace) {
  return [
    namespace.tenantId || DEFAULT_NAMESPACE_IDS.tenantId,
    namespace.spaceId || DEFAULT_NAMESPACE_IDS.spaceId,
    namespace.userId || DEFAULT_NAMESPACE_IDS.userId,
  ].join('/');
}

function buildActorKey(namespace) {
  return [
    namespace.agentId || 'default',
    namespace.roleId || 'default',
  ].join('/');
}

function isDefaultCanonicalScope(namespace) {
  return (
    namespace.tenantId === DEFAULT_NAMESPACE_IDS.tenantId &&
    namespace.spaceId === DEFAULT_NAMESPACE_IDS.spaceId &&
    namespace.userId === DEFAULT_NAMESPACE_IDS.userId
  );
}

function isDefaultNamespace(namespace) {
  return (
    isDefaultCanonicalScope(namespace) &&
    (namespace.agentId || null) === DEFAULT_NAMESPACE_IDS.agentId &&
    (namespace.roleId || null) === DEFAULT_NAMESPACE_IDS.roleId
  );
}

function buildScopedCanonicalSegments(namespace) {
  return [
    'namespaces',
    sanitizePathSegment(namespace.tenantId, 'tenantId'),
    'spaces',
    sanitizePathSegment(namespace.spaceId, 'spaceId'),
    'users',
    sanitizePathSegment(namespace.userId, 'userId'),
  ];
}

function buildScopedRuntimeSegments(namespace) {
  return [
    ...buildScopedCanonicalSegments(namespace),
    'agents',
    sanitizePathSegment(namespace.agentId, 'agentId'),
    'roles',
    sanitizePathSegment(namespace.roleId, 'roleId'),
  ];
}

function buildNamespacePathing(namespace) {
  const defaultNamespace = isDefaultNamespace(namespace);
  const runtimeShadowRoot = defaultNamespace
    ? path.posix.join('runtime', 'shadow')
    : path.posix.join('runtime', 'shadow', ...buildScopedRuntimeSegments(namespace));
  const runtimeRunsRoot = path.posix.join(runtimeShadowRoot, 'runs');
  const runtimeManifestPath = path.posix.join(runtimeShadowRoot, 'manifest.json');
  const derivedReadIndexPath = isDefaultCanonicalScope(namespace)
    ? path.posix.join('core', 'meta', 'read-index.json')
    : path.posix.join('core', 'meta', ...buildScopedCanonicalSegments(namespace), 'read-index.json');

  return {
    canonicalRoot: 'core',
    canonicalPathMode: isDefaultCanonicalScope(namespace)
      ? 'workspace-root-default'
      : 'logical-scope-only',
    layout: defaultNamespace ? SINGLE_TENANT_NAMESPACE_MODE : 'scoped-path-foundation',
    scopedPathsSupported: true,
    derivedReadIndexPath,
    runtimeShadowRoot,
    runtimeRunsRoot,
    runtimeManifestPath,
    runtimePathMode: defaultNamespace ? 'workspace-shadow-default' : 'scoped-runtime-shadow',
  };
}

function resolveNamespace(options = {}) {
  const tenantId = normalizeRequiredString(
    options.tenantId || options.tenant_id,
    DEFAULT_NAMESPACE_IDS.tenantId,
    'tenantId'
  );
  const spaceId = normalizeRequiredString(
    options.spaceId || options.space_id,
    DEFAULT_NAMESPACE_IDS.spaceId,
    'spaceId'
  );
  const userId = normalizeRequiredString(
    options.userId || options.user_id,
    DEFAULT_NAMESPACE_IDS.userId,
    'userId'
  );
  const agentId = normalizeOptionalString(options.agentId || options.agent_id);
  const roleId = normalizeOptionalString(options.roleId || options.role_id);
  const canonicalScope = {
    tenantId,
    spaceId,
    userId,
  };
  const actor = {
    userId,
    agentId,
    roleId,
  };
  const namespace = {
    kind: 'memory-namespace',
    schemaVersion: NAMESPACE_SCHEMA_VERSION,
    mode: isDefaultCanonicalScope({ tenantId, spaceId, userId })
      ? SINGLE_TENANT_NAMESPACE_MODE
      : SCOPED_NAMESPACE_MODE,
    defaultNamespace:
      isDefaultCanonicalScope({ tenantId, spaceId, userId }) &&
      agentId == null &&
      roleId == null,
    namespaceKey: buildNamespaceKey(canonicalScope),
    actorKey: buildActorKey({ agentId, roleId }),
    tenantId,
    spaceId,
    userId,
    canonicalScope,
    actor,
    scope: {
      tenantId,
      spaceId,
      userId,
      agentId,
      roleId,
    },
  };

  return {
    ...namespace,
    pathing: buildNamespacePathing(namespace.scope),
  };
}

module.exports = {
  DEFAULT_NAMESPACE_IDS,
  NAMESPACE_SCHEMA_VERSION,
  SCOPED_NAMESPACE_MODE,
  SINGLE_TENANT_NAMESPACE_MODE,
  buildActorKey,
  buildNamespaceKey,
  buildNamespacePathing,
  resolveNamespace,
};
