'use strict';

function loadPackage(primaryName, fallbackPath) {
  try {
    return require(primaryName);
  } catch (error) {
    if (
      error.code !== 'MODULE_NOT_FOUND' ||
      !String(error.message || '').includes(primaryName)
    ) {
      throw error;
    }

    return require(fallbackPath);
  }
}

function loadMemoryAgents() {
  return loadPackage('@nmc/memory-agents', '../../memory-agents');
}

function loadMemoryCanon() {
  return loadPackage('@nmc/memory-canon', '../../memory-canon');
}

function loadMemoryContracts() {
  return loadPackage('@nmc/memory-contracts', '../../memory-contracts');
}

function loadMemoryScripts() {
  return loadPackage('@nmc/memory-scripts', '../../memory-scripts');
}

function loadMemoryWorkspace() {
  return loadPackage('@nmc/memory-workspace', '../../memory-workspace');
}

function loadMemoryRuntime() {
  return loadPackage('memory-os-runtime', '../../memory-os-runtime');
}

module.exports = {
  loadMemoryAgents,
  loadMemoryCanon,
  loadMemoryContracts,
  loadMemoryRuntime,
  loadMemoryScripts,
  loadMemoryWorkspace,
};
