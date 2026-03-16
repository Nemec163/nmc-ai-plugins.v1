'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  copyTemplateTree,
  ensureDir,
  ensureSymlink,
  expandHome,
  listFilesRecursive,
  relativeWorkspacePath,
  replaceTemplatePlaceholders,
  toConfigPath,
  toPosixPath,
  writeFileIfNeeded,
} = require('..');

function main() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'memory-workspace-validate-fixtures-')
  );

  try {
    const nestedDir = path.join(tempRoot, 'a', 'b', 'c');
    ensureDir(nestedDir);
    assert.equal(fs.existsSync(nestedDir), true, 'ensureDir should create nested directories');

    const managedFile = path.join(tempRoot, 'managed', 'note.txt');
    assert.equal(writeFileIfNeeded(managedFile, 'first\n', false), true);
    assert.equal(fs.readFileSync(managedFile, 'utf8'), 'first\n');
    assert.equal(writeFileIfNeeded(managedFile, 'second\n', false), false);
    assert.equal(fs.readFileSync(managedFile, 'utf8'), 'first\n');
    assert.equal(writeFileIfNeeded(managedFile, 'second\n', true), true);
    assert.equal(fs.readFileSync(managedFile, 'utf8'), 'second\n');

    const targetA = path.join(tempRoot, 'targets', 'a');
    const targetB = path.join(tempRoot, 'targets', 'b');
    const linkPath = path.join(tempRoot, 'links', 'current');
    ensureDir(targetA);
    ensureDir(targetB);
    assert.equal(ensureSymlink(linkPath, targetA, false), true);
    assert.equal(fs.readlinkSync(linkPath), path.relative(path.dirname(linkPath), targetA));
    assert.equal(ensureSymlink(linkPath, targetA, false), false);
    assert.equal(ensureSymlink(linkPath, targetB, false), false);
    assert.equal(ensureSymlink(linkPath, targetB, true), true);
    assert.equal(fs.readlinkSync(linkPath), path.relative(path.dirname(linkPath), targetB));

    const templateRoot = path.join(tempRoot, 'template-root');
    const outputRoot = path.join(tempRoot, 'output-root');
    const markdownFile = path.join(templateRoot, 'docs', 'README.md');
    const dotFile = path.join(templateRoot, '.env');
    const scriptFile = path.join(templateRoot, 'scripts', 'run.sh');
    const binaryFile = path.join(templateRoot, 'assets', 'blob.bin');

    ensureDir(path.dirname(markdownFile));
    ensureDir(path.dirname(scriptFile));
    ensureDir(path.dirname(binaryFile));

    fs.writeFileSync(markdownFile, '# {{INSTALL_DATE}}\n');
    fs.writeFileSync(dotFile, 'date="INSTALL_DATE"\n');
    fs.writeFileSync(scriptFile, '#!/usr/bin/env bash\necho ok\n', 'utf8');
    fs.chmodSync(scriptFile, 0o755);
    fs.writeFileSync(binaryFile, Buffer.from([0, 1, 2, 3]));

    const created = copyTemplateTree(templateRoot, outputRoot, false, '2026-03-17')
      .map((entry) => path.relative(outputRoot, entry))
      .sort();
    assert.deepEqual(created, ['.env', 'assets/blob.bin', 'docs/README.md', 'scripts/run.sh']);
    assert.equal(
      fs.readFileSync(path.join(outputRoot, 'docs', 'README.md'), 'utf8'),
      '# 2026-03-17\n'
    );
    assert.equal(
      fs.readFileSync(path.join(outputRoot, '.env'), 'utf8'),
      'date="2026-03-17"\n'
    );
    assert.deepEqual(
      fs.readFileSync(path.join(outputRoot, 'assets', 'blob.bin')),
      Buffer.from([0, 1, 2, 3])
    );
    assert.equal(fs.statSync(path.join(outputRoot, 'scripts', 'run.sh')).mode & 0o777, 0o755);
    assert.equal(copyTemplateTree(templateRoot, outputRoot, false, '2026-03-18').length, 0);

    assert.equal(
      replaceTemplatePlaceholders('A {{INSTALL_DATE}} B "INSTALL_DATE"', '2026-03-17'),
      'A 2026-03-17 B "2026-03-17"'
    );
    assert.equal(expandHome('~/workspace'), path.join(os.homedir(), 'workspace'));
    assert.equal(toConfigPath(path.join(os.homedir(), 'workspace')), '~/workspace');
    assert.equal(toConfigPath(os.homedir()), '~');
    assert.equal(toPosixPath(['alpha', 'beta', 'gamma'].join(path.sep)), 'alpha/beta/gamma');
    assert.equal(
      relativeWorkspacePath('/tmp/example/nyx', '/tmp/example/system/memory'),
      '../system/memory'
    );

    const listed = listFilesRecursive(templateRoot)
      .map((entry) => path.relative(templateRoot, entry))
      .sort();
    assert.deepEqual(listed, ['.env', 'assets/blob.bin', 'docs/README.md', 'scripts/run.sh']);

    console.log('Validated workspace utility helpers through @nmc/memory-workspace.');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main();
