'use strict';

function loadMemoryContracts() {
  try {
    return require('@nmc/memory-contracts');
  } catch (error) {
    if (
      error.code !== 'MODULE_NOT_FOUND' ||
      !String(error.message || '').includes('@nmc/memory-contracts')
    ) {
      throw error;
    }

    // Workspace tests run directly from source without a workspace install step.
    return require('../../memory-contracts');
  }
}

module.exports = loadMemoryContracts();
