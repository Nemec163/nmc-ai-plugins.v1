'use strict';

const path = require('path');
const phases = require('./lib/phases');

const BIN_DIR = path.join(__dirname, 'bin');

module.exports = {
  ...phases,
  scripts: {
    pipeline: path.join(BIN_DIR, 'run-pipeline.sh'),
  },
};
