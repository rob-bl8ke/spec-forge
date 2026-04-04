import { Command } from "commander";
import { getCommandContext } from "../config/context";

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .argument("<project-name>", "Project name")
    .description("Sync configured assets into a repository")
    .action(() => {
      const context = getCommandContext();
      console.log(`sync is not implemented yet. Loaded config from ${context.rootDir}.`);
    });
}
