'use strict';

const path = require('path');
const phases = require('./lib/phases');

const BIN_DIR = path.join(__dirname, 'bin');

module.exports = {
  ...phases,
  ...require('./lib/adapter-runner'),
  scripts: {
    llmPhaseRunner: path.join(BIN_DIR, 'run-llm-phase.js'),
    pipeline: path.join(BIN_DIR, 'run-pipeline.sh'),
  },
};
