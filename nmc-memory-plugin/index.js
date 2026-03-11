const path = require("path");

const {
  addCommanderOptions,
  optionsFromCommander,
  printSummary,
  setupOpenClaw,
} = require("./lib/openclaw-setup");

module.exports = {
  id: "nmc-memory-plugin",
  name: "NMC Memory Plugin",
  register(api) {
    if (!api || typeof api.registerCli !== "function") {
      return;
    }

    api.registerCli(
      ({ program }) => {
        const pluginRoot = __dirname;
        const nmcMemory = program
          .command("nmc-memory")
          .description("NMC memory and multi-agent workspace utilities");

        addCommanderOptions(
          nmcMemory
            .command("setup")
            .description(
              "Scaffold OpenClaw multi-agent workspaces and shared memory canon",
            ),
        ).action((options) => {
          const result = setupOpenClaw(optionsFromCommander(options, pluginRoot));
          console.log(printSummary(result));
        });
      },
      { commands: ["nmc-memory"] },
    );
  },
};
