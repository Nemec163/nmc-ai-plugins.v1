'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BIN_DIR = path.join(ROOT_DIR, 'bin');
const SCRIPT_MAP = {
  verify: 'verify.sh',
  status: 'status.sh',
  onboard: 'onboard.sh',
  retention: 'retention.sh',
};
const WRAPPER_MAP = {
  verify: path.resolve(ROOT_DIR, '../adapter-openclaw/skills/memory-verify/verify.sh'),
  status: path.resolve(ROOT_DIR, '../adapter-openclaw/skills/memory-status/status.sh'),
  onboard: path.resolve(ROOT_DIR, '../adapter-openclaw/skills/memory-onboard-agent/onboard.sh'),
  retention: path.resolve(ROOT_DIR, '../adapter-openclaw/skills/memory-retention/retention.sh'),
};

function ensureFile(pathname) {
  if (!fs.existsSync(pathname)) {
    throw new Error(`Expected script file to exist: ${pathname}`);
  }

  const stats = fs.statSync(pathname);
  if (!stats.isFile()) {
    throw new Error(`Expected regular file: ${pathname}`);
  }
}

function ensureExecutable(pathname) {
  fs.accessSync(pathname, fs.constants.X_OK);
}

function ensureBashSyntax(pathname) {
  const result = spawnSync('bash', ['-n', pathname], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `bash -n failed for ${pathname}\nstdout:\n${result.stdout || ''}\nstderr:\n${result.stderr || ''}`,
    );
  }
}

function ensureWrapperTargets(pathname, bundledTarget, workspaceTarget) {
  const contents = fs.readFileSync(pathname, 'utf8');

  if (!contents.includes('exec ')) {
    throw new Error(`Expected wrapper to exec canonical script: ${pathname}`);
  }

  if (!contents.includes(bundledTarget) || !contents.includes(workspaceTarget)) {
    throw new Error(
      `Expected wrapper ${pathname} to reference ${bundledTarget} and ${workspaceTarget}, got:\n${contents}`,
    );
  }
}

function main() {
  const exported = require('../index.js');
  if (!exported || !exported.scripts) {
    throw new Error('Expected index.js to export scripts mapping');
  }

  for (const [name, fileName] of Object.entries(SCRIPT_MAP)) {
    const expectedPath = path.join(BIN_DIR, fileName);
    const exportedPath = exported.scripts[name];

    if (path.resolve(exportedPath || '') !== expectedPath) {
      throw new Error(
        `Export mismatch for ${name}: expected ${expectedPath}, got ${String(exportedPath)}`,
      );
    }

    ensureFile(expectedPath);
    ensureExecutable(expectedPath);
    ensureBashSyntax(expectedPath);

    const wrapperPath = WRAPPER_MAP[name];
    ensureFile(wrapperPath);
    ensureExecutable(wrapperPath);
    ensureBashSyntax(wrapperPath);
    ensureWrapperTargets(
      wrapperPath,
      `memory-scripts/bin/${fileName}`,
      `../memory-scripts/bin/${fileName}`,
    );
  }

  console.log('Validated 4 scripts and legacy wrappers through @nmc/memory-scripts.');
}

main();
