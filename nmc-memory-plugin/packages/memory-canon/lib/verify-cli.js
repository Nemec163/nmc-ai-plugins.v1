'use strict';

const { verifyCanonWorkspace } = require('./verify');

function main() {
  const [memoryRoot, updatedAt, today] = process.argv.slice(2);

  if (!memoryRoot || !updatedAt || !today) {
    console.error('Usage: verify-cli.js <memory-root> <updated-at> <today>');
    process.exit(2);
  }

  const result = verifyCanonWorkspace({
    memoryRoot,
    updatedAt,
    today,
    stderr: process.stderr,
  });

  process.stdout.write(`${result.warningCount}\n`);
}

main();
