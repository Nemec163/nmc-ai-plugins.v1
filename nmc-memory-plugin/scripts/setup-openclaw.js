#!/usr/bin/env node
"use strict";

const path = require("path");

const { runSetupCli } = require("../packages/adapter-openclaw/lib/setup-cli");

const result = runSetupCli(process.argv.slice(2), path.resolve(__dirname, ".."));

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}

process.exitCode = result.exitCode;
