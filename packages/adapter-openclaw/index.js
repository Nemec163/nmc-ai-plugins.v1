"use strict";

module.exports = {
  ...require("./lib/conformance-adapter"),
  ...require("./lib/pipeline-adapter"),
  ...require("./lib/openclaw-setup"),
  ...require("./lib/setup-cli"),
  ...require("./lib/register"),
};
