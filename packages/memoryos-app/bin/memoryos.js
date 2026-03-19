#!/usr/bin/env node
'use strict';

const { runCli } = require('../lib/cli');

Promise.resolve()
  .then(() => runCli(process.argv.slice(2)))
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
