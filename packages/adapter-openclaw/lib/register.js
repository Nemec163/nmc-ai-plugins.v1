"use strict";

const {
  PLUGIN_ID,
  PLUGIN_NAME,
  registerOpenClawPlugin,
} = require("./openclaw-setup");

function createOpenClawPlugin(options = {}) {
  const pluginId = options.pluginId || PLUGIN_ID;
  const pluginName = options.pluginName || PLUGIN_NAME;
  const pluginRoot = options.pluginRoot;

  if (!pluginRoot) {
    throw new Error("pluginRoot is required");
  }

  return {
    id: pluginId,
    name: pluginName,
    register(api) {
      registerOpenClawPlugin(api, pluginRoot);
    },
  };
}

module.exports = {
  createOpenClawPlugin,
  registerOpenClawPlugin,
};
