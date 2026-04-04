import { Command } from "commander";

export function registerHarvestCommand(program: Command): void {
  program
    .command("harvest")
    .argument("<project-name>", "Project name")
    .description("Harvest engineering patterns from git history")
    .action(() => {
      console.log("harvest is not implemented yet.");
    });
}
