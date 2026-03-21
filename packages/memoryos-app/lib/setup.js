'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadPackage, resolvePackagePath } = require('./load-package');

const APP_ID = 'memoryos';
const APP_NAME = 'MemoryOS';

let cachedGateway = null;
let cachedWorkspace = null;

function loadMemoryGateway() {
  if (cachedGateway) {
    return cachedGateway;
  }

  cachedGateway = loadPackage('memory-os-gateway', ['../../memory-os-gateway']);
  return cachedGateway;
}

function loadMemoryWorkspace() {
  if (cachedWorkspace) {
    return cachedWorkspace;
  }

  cachedWorkspace = loadPackage('@nmc/memory-workspace', ['../../memory-workspace']);
  return cachedWorkspace;
}

function expandHome(inputPath) {
  if (!inputPath) {
    return inputPath;
  }

  return loadMemoryWorkspace().expandHome(inputPath);
}

function ensureDir(dirPath) {
  return loadMemoryWorkspace().ensureDir(dirPath);
}

function readConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function writeConfig(options) {
  const config = {
    schemaVersion: '1.0',
    appId: APP_ID,
    appName: APP_NAME,
    stateDir: options.stateDir,
    workspaceRoot: options.workspaceRoot,
    systemRoot: options.systemRoot,
    memoryRoot: options.memoryRoot,
    sharedSkillsRoot: options.sharedSkillsRoot,
    runtimeRoot: options.runtimeRoot,
    installDate: options.installDate,
  };
  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  const previous = fs.existsSync(options.configPath)
    ? fs.readFileSync(options.configPath, 'utf8')
    : null;

  ensureDir(path.dirname(options.configPath));

  if (previous !== null && previous !== serialized) {
    fs.writeFileSync(`${options.configPath}.bak`, previous, 'utf8');
  }

  if (previous !== serialized) {
    fs.writeFileSync(options.configPath, serialized, 'utf8');
  }

  return {
    path: options.configPath,
    changed: previous !== serialized,
    backedUp: previous !== null && previous !== serialized,
    values: config,
  };
}

function normalizeOptions(rawOptions = {}) {
  const stateDir = path.resolve(
    expandHome(rawOptions.stateDir || path.join(os.homedir(), '.memoryos'))
  );
  const workspaceRoot = path.resolve(
    expandHome(rawOptions.workspaceRoot || stateDir)
  );
  const systemRoot = path.resolve(
    expandHome(rawOptions.systemRoot || path.join(workspaceRoot, 'system'))
  );
  const memoryRoot = path.resolve(
    expandHome(rawOptions.memoryRoot || path.join(systemRoot, 'memory'))
  );
  const sharedSkillsRoot = path.resolve(
    expandHome(rawOptions.sharedSkillsRoot || path.join(systemRoot, 'skills'))
  );
  const runtimeRoot = path.resolve(
    expandHome(rawOptions.runtimeRoot || path.join(stateDir, 'runtime'))
  );
  const configPath = path.resolve(
    expandHome(rawOptions.configPath || path.join(stateDir, 'memoryos.json'))
  );

  return {
    stateDir,
    workspaceRoot,
    systemRoot,
    memoryRoot,
    sharedSkillsRoot,
    runtimeRoot,
    configPath,
    overwrite: rawOptions.overwrite === true,
    installDate: rawOptions.installDate || new Date().toISOString().slice(0, 10),
  };
}

function resolveStandalonePaths(rawOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const config = readConfig(options.configPath);

  const resolved = !config
    ? { ...options }
    : {
    ...options,
    stateDir: path.resolve(expandHome(rawOptions.stateDir || config.stateDir || options.stateDir)),
    workspaceRoot: path.resolve(
      expandHome(rawOptions.workspaceRoot || config.workspaceRoot || options.workspaceRoot)
    ),
    systemRoot: path.resolve(
      expandHome(rawOptions.systemRoot || config.systemRoot || options.systemRoot)
    ),
    memoryRoot: path.resolve(
      expandHome(rawOptions.memoryRoot || config.memoryRoot || options.memoryRoot)
    ),
    sharedSkillsRoot: path.resolve(
      expandHome(
        rawOptions.sharedSkillsRoot || config.sharedSkillsRoot || options.sharedSkillsRoot
      )
    ),
    runtimeRoot: path.resolve(
      expandHome(rawOptions.runtimeRoot || config.runtimeRoot || options.runtimeRoot)
    ),
  };

  if (rawOptions.memoryRoot && !rawOptions.systemRoot) {
    resolved.systemRoot = path.dirname(resolved.memoryRoot);
  }

  if (rawOptions.systemRoot && !rawOptions.workspaceRoot) {
    resolved.workspaceRoot = path.dirname(resolved.systemRoot);
  }

  if (rawOptions.memoryRoot && !rawOptions.workspaceRoot) {
    resolved.workspaceRoot = path.dirname(resolved.systemRoot);
  }

  return resolved;
}

function setupStandalone(rawOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const gateway = loadMemoryGateway();

  ensureDir(options.runtimeRoot);

  const result = gateway.bootstrap({
    stateDir: options.stateDir,
    workspaceRoot: options.workspaceRoot,
    systemRoot: options.systemRoot,
    memoryRoot: options.memoryRoot,
    sharedSkillsRoot: options.sharedSkillsRoot,
    systemTemplateRoot: resolvePackagePath('memory-workspace', 'templates', 'workspace-system'),
    memoryTemplateRoot: resolvePackagePath('memory-workspace', 'templates', 'workspace-memory'),
    skillsSourceRoot: resolvePackagePath('memory-workspace', 'skills'),
    installDate: options.installDate,
    overwrite: options.overwrite,
  });

  const config = writeConfig(options);

  return {
    ...result,
    runtimeRoot: options.runtimeRoot,
    config,
  };
}

function printSummary(result) {
  const lines = [
    'MemoryOS standalone setup summary',
    `State dir: ${result.stateDir}`,
    `Workspace root: ${result.workspaceRoot}`,
    `Shared system root: ${result.systemRoot}`,
    `Shared memory root: ${result.memoryRoot}`,
    `Runtime root: ${result.runtimeRoot}`,
    `Shared system files created: ${result.systemCreated.length}`,
    `Shared memory files created: ${result.memoryCreated.length}`,
    `Shared skill links created: ${result.sharedSkills.created.length}`,
  ];

  for (const agent of result.agents) {
    lines.push(`Agent ${agent.id}: ${agent.workspaceDir} (${agent.created.length} files created)`);
  }

  lines.push(
    `Config updated: ${result.config.path} (changed: ${result.config.changed ? 'yes' : 'no'})`
  );
  lines.push(
    `Config backup: ${result.config.backedUp ? `${result.config.path}.bak` : 'not needed'}`
  );

  return lines.join('\n');
}

module.exports = {
  APP_ID,
  APP_NAME,
  normalizeOptions,
  printSummary,
  resolveStandalonePaths,
  setupStandalone,
};
