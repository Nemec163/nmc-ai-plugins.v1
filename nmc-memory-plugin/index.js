"use strict";

const { createOpenClawPlugin } = require("./packages/adapter-openclaw/lib/register");

module.exports = createOpenClawPlugin({
  pluginRoot: __dirname,
});
