'use strict';

const { spawnSync } = require('node:child_process');

let cachedMemoryContracts = null;

function loadMemoryContracts() {
  if (cachedMemoryContracts) {
    return cachedMemoryContracts;
  }

  try {
    cachedMemoryContracts = require('@nmc/memory-contracts');
    return cachedMemoryContracts;
  } catch (error) {
    if (
      error.code !== 'MODULE_NOT_FOUND' ||
      !String(error.message || '').includes('@nmc/memory-contracts')
    ) {
      throw error;
    }

    cachedMemoryContracts = require('../../memory-contracts');
    return cachedMemoryContracts;
  }
}

function loadPipelineAdapterModule(options = {}) {
  const moduleRef = options.adapterModule || process.env.PIPELINE_ADAPTER_MODULE;
  if (!moduleRef) {
    throw new Error('adapterModule is required for LLM pipeline phases');
  }

  return require(moduleRef);
}

function getAdapterInvocation(options) {
  const contracts = loadMemoryContracts();
  const adapter = loadPipelineAdapterModule(options).createOpenClawPipelineAdapter();

  return contracts.getPipelineInvocation(adapter, options.phase, {
    date: options.date,
    memoryRoot: options.memoryRoot,
    llmRunner: options.llmRunner,
  });
}

function describeAdapterInvocation(options) {
  return loadMemoryContracts().formatPipelineInvocation(getAdapterInvocation(options));
}

function runAdapterInvocation(options) {
  const invocation = getAdapterInvocation(options);
  const result = spawnSync(invocation.command, invocation.args, {
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return {
    status: result.status == null ? 1 : result.status,
    signal: result.signal || null,
  };
}

module.exports = {
  describeAdapterInvocation,
  getAdapterInvocation,
  runAdapterInvocation,
};
