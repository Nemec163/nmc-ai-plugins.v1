#!/usr/bin/env node
'use strict';

const { runCli } = require('../lib/cli');

try {
  process.exitCode = runCli(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
