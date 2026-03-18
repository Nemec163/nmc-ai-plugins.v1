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

function loadGateway() {
  return loadPackage('memory-os-gateway', '../../memory-os-gateway');
}

function loadMemoryCanon() {
  return loadPackage('@nmc/memory-canon', '../../memory-canon');
}

function loadMemoryMaintainer() {
  return loadPackage('@nmc/memory-maintainer', '../../memory-maintainer');
}

module.exports = {
  loadGateway,
  loadMemoryCanon,
  loadMemoryMaintainer,
};
