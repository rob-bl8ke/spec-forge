import { Command } from "commander";

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .argument("<project-name>", "Project name")
    .description("Sync configured assets into a repository")
    .action(() => {
      console.log("sync is not implemented yet.");
    });
}
