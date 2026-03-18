'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  copyMemoryTemplate,
  copySystemTemplate,
  copyTemplateTree,
  createSharedSkillsWorkspace,
  ensureDir,
  ensureAgentState,
  ensureSymlink,
  expandHome,
  listFilesRecursive,
  relativeWorkspacePath,
  replaceTemplatePlaceholders,
  scaffoldAgentWorkspace,
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

    const memoryTemplateRoot = path.join(tempRoot, 'memory-template');
    const memoryTargetRoot = path.join(tempRoot, 'memory-output');
    const memoryReadme = path.join(memoryTemplateRoot, 'core', 'README.md');
    ensureDir(path.dirname(memoryReadme));
    fs.writeFileSync(memoryReadme, 'Installed {{INSTALL_DATE}}\n');

    const memoryCreated = copyMemoryTemplate(
      memoryTemplateRoot,
      memoryTargetRoot,
      false,
      '2026-03-17'
    ).map((entry) => path.relative(memoryTargetRoot, entry));
    assert.deepEqual(memoryCreated, ['core/README.md']);
    assert.equal(
      fs.readFileSync(path.join(memoryTargetRoot, 'core', 'README.md'), 'utf8'),
      'Installed 2026-03-17\n'
    );
    assert.equal(copyMemoryTemplate(memoryTemplateRoot, memoryTargetRoot, false, '2026-03-18').length, 0);

    const systemTemplateRoot = path.join(tempRoot, 'system-template');
    const systemTargetRoot = path.join(tempRoot, 'system-output');
    const systemConfig = path.join(systemTemplateRoot, 'tasks', 'active', '.kanban.json');
    ensureDir(path.dirname(systemConfig));
    fs.writeFileSync(systemConfig, '{\"installed\":\"INSTALL_DATE\"}\n');

    const systemCreated = copySystemTemplate(
      systemTemplateRoot,
      systemTargetRoot,
      false,
      '2026-03-17'
    ).map((entry) => path.relative(systemTargetRoot, entry));
    assert.deepEqual(systemCreated, ['tasks/active/.kanban.json']);
    assert.equal(
      fs.readFileSync(path.join(systemTargetRoot, 'tasks', 'active', '.kanban.json'), 'utf8'),
      '{"installed":"2026-03-17"}\n'
    );
    assert.equal(copySystemTemplate(systemTemplateRoot, systemTargetRoot, false, '2026-03-18').length, 0);

    const skillsSourceRoot = path.join(tempRoot, 'plugin-skills');
    const sharedSkillsRoot = path.join(tempRoot, 'workspace', 'system', 'skills');
    ensureDir(path.join(skillsSourceRoot, 'memory-query'));
    ensureDir(path.join(skillsSourceRoot, 'memory-status'));
    fs.writeFileSync(path.join(skillsSourceRoot, 'README.txt'), 'skip me\n');

    const sharedSkills = createSharedSkillsWorkspace(skillsSourceRoot, sharedSkillsRoot, false);
    assert.equal(sharedSkills.root, sharedSkillsRoot);
    assert.deepEqual(
      sharedSkills.created.map((entry) => path.relative(sharedSkillsRoot, entry)).sort(),
      ['memory-query', 'memory-status']
    );
    assert.equal(fs.lstatSync(path.join(sharedSkillsRoot, 'memory-query')).isSymbolicLink(), true);
    assert.equal(
      fs.readlinkSync(path.join(sharedSkillsRoot, 'memory-query')),
      path.relative(path.join(sharedSkillsRoot), path.join(skillsSourceRoot, 'memory-query'))
    );
    assert.equal(createSharedSkillsWorkspace(skillsSourceRoot, sharedSkillsRoot, false).created.length, 0);

    const workspaceDir = path.join(tempRoot, 'workspace', 'nyx');
    const systemRoot = path.join(tempRoot, 'workspace', 'system');
    ensureDir(systemRoot);
    const scaffoldedAgent = scaffoldAgentWorkspace({
      agentId: 'nyx',
      workspaceDir,
      files: {
        'AGENTS.md': '# Nyx\n',
        'memory/2026-03-17.md': 'log\n',
      },
      sharedSkillsRoot,
      systemRoot,
      overwrite: false,
    });
    assert.equal(scaffoldedAgent.id, 'nyx');
    assert.equal(scaffoldedAgent.workspaceDir, workspaceDir);
    assert.deepEqual(
      scaffoldedAgent.created.map((entry) => path.relative(workspaceDir, entry)).sort(),
      ['AGENTS.md', 'memory/2026-03-17.md', 'skills', 'system']
    );
    assert.equal(fs.readFileSync(path.join(workspaceDir, 'AGENTS.md'), 'utf8'), '# Nyx\n');
    assert.equal(fs.lstatSync(path.join(workspaceDir, 'skills')).isSymbolicLink(), true);
    assert.equal(fs.lstatSync(path.join(workspaceDir, 'system')).isSymbolicLink(), true);
    assert.equal(scaffoldAgentWorkspace({
      agentId: 'nyx',
      workspaceDir,
      files: {
        'AGENTS.md': 'changed\n',
        'memory/2026-03-17.md': 'changed\n',
      },
      sharedSkillsRoot,
      systemRoot,
      overwrite: false,
    }).created.length, 0);
    assert.equal(fs.readFileSync(path.join(workspaceDir, 'AGENTS.md'), 'utf8'), '# Nyx\n');

    const stateDir = path.join(tempRoot, 'state');
    const agentState = ensureAgentState('nyx', stateDir);
    assert.equal(agentState.id, 'nyx');
    assert.equal(agentState.root, path.join(stateDir, 'agents', 'nyx'));
    assert.deepEqual(
      agentState.created.map((entry) => path.relative(stateDir, entry)).sort(),
      ['agents/nyx/agent', 'agents/nyx/sessions']
    );
    assert.equal(fs.existsSync(path.join(stateDir, 'agents', 'nyx', 'agent')), true);
    assert.equal(fs.existsSync(path.join(stateDir, 'agents', 'nyx', 'sessions')), true);
    assert.equal(ensureAgentState('nyx', stateDir).created.length, 0);

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
