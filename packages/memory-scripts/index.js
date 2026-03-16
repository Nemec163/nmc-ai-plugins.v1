'use strict';

const path = require('path');

const BIN_DIR = path.join(__dirname, 'bin');

module.exports = {
  scripts: {
    verify: path.join(BIN_DIR, 'verify.sh'),
    status: path.join(BIN_DIR, 'status.sh'),
    onboard: path.join(BIN_DIR, 'onboard.sh'),
    retention: path.join(BIN_DIR, 'retention.sh'),
  },
};
