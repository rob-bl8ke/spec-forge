import { Command } from "commander";
import { getCommandContext } from "../config/context";

export function registerHarvestCommand(program: Command): void {
  program
    .command("harvest")
    .argument("<project-name>", "Project name")
    .description("Harvest engineering patterns from git history")
    .action(() => {
      const context = getCommandContext();
      console.log(`harvest is not implemented yet. Loaded config from ${context.rootDir}.`);
    });
}
