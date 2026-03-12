const path = require("path");

const {
  addCommanderOptions,
  maybeAutoSetup,
  optionsFromCommander,
  printSummary,
  setupOpenClaw,
} = require("./lib/openclaw-setup");

function log(api, level, message) {
  if (api && api.logger && typeof api.logger[level] === "function") {
    api.logger[level](message);
    return;
  }

  if (level === "error") {
    console.error(message);
    return;
  }

  console.log(message);
}

module.exports = {
  id: "nmc-memory-plugin",
  name: "NMC Memory Plugin",
  register(api) {
    const pluginRoot = __dirname;

    if (api && typeof api.registerCli === "function") {
      api.registerCli(
        ({ program }) => {
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
    }

    if (api && typeof api.registerService === "function") {
      api.registerService({
        name: "nmc-memory-bootstrap",
        start() {
          try {
            const result = maybeAutoSetup(api, pluginRoot);
            if (!result) {
              return;
            }

            const createdCount =
              result.memoryCreated.length +
              result.sharedSkills.created.length +
              result.agentState.reduce((sum, agent) => sum + agent.created.length, 0) +
              result.agents.reduce((sum, agent) => sum + agent.created.length, 0);
            if (createdCount > 0 || (result.config && result.config.changed)) {
              log(
                api,
                "info",
                `[nmc-memory-plugin] bootstrap completed for ${result.workspaceRoot}`,
              );
            }
          } catch (error) {
            log(api, "error", `[nmc-memory-plugin] bootstrap failed: ${error.message}`);
          }
        },
      });
    }
  },
};
