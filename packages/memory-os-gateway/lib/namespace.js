'use strict';

const path = require('node:path');

const { loadMemoryContracts } = require('./load-deps');

function resolveMemoryRoot(memoryRoot) {
  if (!memoryRoot) {
    throw new Error('memoryRoot is required');
  }

  return path.resolve(memoryRoot);
}

function buildNamespaceContext(options = {}) {
  const contracts = loadMemoryContracts();
  const memoryRoot = resolveMemoryRoot(options.memoryRoot);
  const namespace = contracts.resolveNamespace({
    tenantId: options.tenantId,
    tenant_id: options.tenant_id,
    spaceId: options.spaceId,
    space_id: options.space_id,
    userId: options.userId,
    user_id: options.user_id,
    agentId: options.agentId,
    agent_id: options.agent_id,
    roleId: options.roleId,
    role_id: options.role_id,
  });

  return {
    ...namespace,
    memoryRoot,
    surface: options.surface || null,
    authorityBoundary: {
      runtimeAuthoritative: false,
      canonicalPromotionPath: 'single-promoter',
    },
  };
}

module.exports = {
  buildNamespaceContext,
};
