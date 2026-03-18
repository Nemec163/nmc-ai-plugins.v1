"use strict";

module.exports = {
  ...require("./lib/conformance-adapter"),
  ...require("./lib/pipeline-adapter"),
  ...require("./lib/openclaw-setup"),
  ...require("./lib/runtime-orchestration"),
  ...require("./lib/setup-cli"),
  ...require("./lib/register"),
};
