import { Command } from "commander";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .argument("<project-name>", "Project name")
    .requiredOption("--repo <path>", "Path to the target repository")
    .description("Initialize a project configuration")
    .action(() => {
      console.log("init is not implemented yet.");
    });
}
