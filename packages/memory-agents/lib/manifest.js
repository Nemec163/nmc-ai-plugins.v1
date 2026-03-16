'use strict';

const { getAgent, PREDEFINED_AGENTS } = require('./roster');
const { agentWorkspaceFiles } = require('./render');

function roleManifest(agent) {
  return {
    id: agent.id,
    name: agent.name,
    title: agent.title,
    model: agent.model,
    style: agent.style,
    emoji: agent.emoji,
    theme: agent.theme,
    mission: agent.mission,
    canonPolicy: agent.canonPolicy,
    workspaceFocus: [...agent.workspaceFocus],
    toolsFocus: [...agent.toolsFocus],
    subagents: [...agent.subagents],
    heartbeat: agent.heartbeat,
    heartbeatConfig: agent.heartbeatConfig ? { ...agent.heartbeatConfig } : null,
  };
}

function rosterManifest() {
  return PREDEFINED_AGENTS.map((agent) => roleManifest(agent));
}

function buildRoleBundle(agent, options) {
  return {
    manifest: roleManifest(agent),
    files: agentWorkspaceFiles(
      agent,
      options.installDate,
      options.memoryPath,
      options.systemPath
    ),
  };
}

function getRoleBundle(agentId, options) {
  return buildRoleBundle(getAgent(agentId), options);
}

module.exports = {
  buildRoleBundle,
  getRoleBundle,
  roleManifest,
  rosterManifest,
};
