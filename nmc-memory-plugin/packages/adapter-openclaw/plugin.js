"use strict";

const { createOpenClawPlugin } = require("./lib/register");

module.exports = createOpenClawPlugin({
  pluginRoot: __dirname,
});
