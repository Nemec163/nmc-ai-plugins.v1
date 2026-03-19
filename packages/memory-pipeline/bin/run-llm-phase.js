#!/usr/bin/env node
'use strict';

const {
  describeAdapterInvocation,
  runAdapterInvocation,
} = require('../lib/adapter-runner');

function usage() {
  console.error(
    'Usage: run-llm-phase.js <describe|run> --phase <extract|curate|apply> --date <YYYY-MM-DD> [--memory-root <path>] [--adapter-module <path>] [--llm-runner <cmd>]'
  );
  console.error(
    '  extract and curate require an adapter module; apply is a compatibility phase name that runs through the in-process core promoter.'
  );
}

function parseArgs(argv) {
  const mode = argv[0];
  const flags = {};

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      throw new Error(`unexpected argument: ${arg}`);
    }

    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`missing value for --${key}`);
    }

    flags[key] = value;
    index += 1;
  }

  return {
    mode,
    adapterModule: flags['adapter-module'],
    phase: flags.phase,
    date: flags.date,
    memoryRoot: flags['memory-root'],
    llmRunner: flags['llm-runner'],
  };
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`error: ${error.message}`);
    usage();
    return 2;
  }

  if (!['describe', 'run'].includes(options.mode)) {
    console.error(`error: invalid mode: ${options.mode || ''}`);
    usage();
    return 2;
  }

  if (!options.phase || !options.date) {
    console.error('error: --phase and --date are required');
    usage();
    return 2;
  }

  if (options.mode === 'describe') {
    console.log(describeAdapterInvocation(options));
    return 0;
  }

  return runAdapterInvocation(options).status;
}

process.exitCode = main(process.argv.slice(2));
