'use strict';

const path = require('node:path');

const {
  loadMemoryAgents,
  loadMemoryWorkspace,
} = require('./load-deps');

function requireOption(options, key) {
  if (options[key] == null || options[key] === '') {
    throw new Error(`${key} is required`);
  }

  return options[key];
}

function bootstrapRole(options) {
  const roleId = requireOption(options, 'roleId');
  const workspaceDir = path.resolve(requireOption(options, 'workspaceDir'));
  const sharedSkillsRoot = path.resolve(requireOption(options, 'sharedSkillsRoot'));
  const systemRoot = path.resolve(requireOption(options, 'systemRoot'));
  const installDate = options.installDate || new Date().toISOString().slice(0, 10);
  const overwrite = options.overwrite === true;

  const memoryWorkspace = loadMemoryWorkspace();
  const memoryAgents = loadMemoryAgents();
  const memoryPath =
    options.memoryPath ||
    memoryWorkspace.relativeWorkspacePath(
      workspaceDir,
      path.resolve(requireOption(options, 'memoryRoot'))
    );
  const systemPath =
    options.systemPath ||
    memoryWorkspace.relativeWorkspacePath(workspaceDir, systemRoot);

  const bundle = memoryAgents.getRoleBundle(roleId, {
    installDate,
    memoryPath,
    systemPath,
  });

  const workspace = memoryWorkspace.scaffoldAgentWorkspace({
    agentId: roleId,
    workspaceDir,
    files: bundle.files,
    sharedSkillsRoot,
    systemRoot,
    overwrite,
  });

  const state =
    options.stateDir != null
      ? memoryWorkspace.ensureAgentState(roleId, path.resolve(options.stateDir))
      : null;

  return {
    kind: 'role',
    role: bundle.manifest,
    bundle,
    workspace,
    state,
  };
}

function bootstrapWorkspace(options) {
  const stateDir = path.resolve(requireOption(options, 'stateDir'));
  const workspaceRoot = path.resolve(requireOption(options, 'workspaceRoot'));
  const systemRoot = path.resolve(requireOption(options, 'systemRoot'));
  const memoryRoot = path.resolve(requireOption(options, 'memoryRoot'));
  const systemTemplateRoot = path.resolve(requireOption(options, 'systemTemplateRoot'));
  const memoryTemplateRoot = path.resolve(requireOption(options, 'memoryTemplateRoot'));
  const skillsSourceRoot = path.resolve(requireOption(options, 'skillsSourceRoot'));
  const sharedSkillsRoot = path.resolve(options.sharedSkillsRoot || path.join(systemRoot, 'skills'));
  const installDate = options.installDate || new Date().toISOString().slice(0, 10);
  const overwrite = options.overwrite === true;

  const memoryWorkspace = loadMemoryWorkspace();
  const memoryAgents = loadMemoryAgents();

  memoryWorkspace.ensureDir(stateDir);
  memoryWorkspace.ensureDir(workspaceRoot);
  memoryWorkspace.ensureDir(systemRoot);

  const systemCreated = memoryWorkspace.copySystemTemplate(
    systemTemplateRoot,
    systemRoot,
    overwrite,
    installDate
  );
  const memoryCreated = memoryWorkspace.copyMemoryTemplate(
    memoryTemplateRoot,
    memoryRoot,
    overwrite,
    installDate
  );
  const sharedSkills = memoryWorkspace.createSharedSkillsWorkspace(
    skillsSourceRoot,
    sharedSkillsRoot,
    overwrite
  );

  const roleBundles = [];
  const agents = memoryAgents.getRoster().map((agent) => {
    const workspaceDir = path.join(workspaceRoot, agent.id);
    const memoryPath = memoryWorkspace.relativeWorkspacePath(workspaceDir, memoryRoot);
    const systemPath = memoryWorkspace.relativeWorkspacePath(workspaceDir, systemRoot);
    const bundle = memoryAgents.getRoleBundle(agent.id, {
      installDate,
      memoryPath,
      systemPath,
    });

    roleBundles.push(bundle);

    return memoryWorkspace.scaffoldAgentWorkspace({
      agentId: agent.id,
      workspaceDir,
      files: bundle.files,
      sharedSkillsRoot: sharedSkills.root,
      systemRoot,
      overwrite,
    });
  });

  const agentState = memoryAgents.getRoster().map((agent) =>
    memoryWorkspace.ensureAgentState(agent.id, stateDir)
  );

  return {
    kind: 'workspace',
    stateDir,
    workspaceRoot,
    systemRoot,
    memoryRoot,
    sharedSkills,
    systemCreated,
    memoryCreated,
    roleBundles,
    agents,
    agentState,
  };
}

function getRoleBundle(options) {
  const roleId = typeof options === 'string' ? options : options.roleId;
  const resolvedOptions =
    typeof options === 'string'
      ? {}
      : {
          installDate: options.installDate,
          memoryPath: options.memoryPath,
          systemPath: options.systemPath,
        };

  return loadMemoryAgents().getRoleBundle(roleId, {
    installDate: resolvedOptions.installDate || new Date().toISOString().slice(0, 10),
    memoryPath: resolvedOptions.memoryPath || '../system/memory',
    systemPath: resolvedOptions.systemPath || '../system',
  });
}

function bootstrap(options) {
  if (options && options.roleId) {
    return bootstrapRole(options);
  }

  return bootstrapWorkspace(options || {});
}

module.exports = {
  bootstrap,
  bootstrapRole,
  bootstrapWorkspace,
  getRoleBundle,
  get_role_bundle: getRoleBundle,
};
