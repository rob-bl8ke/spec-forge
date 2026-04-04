import { Command } from "commander";

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .argument("<workflow-or-step>", "Workflow ID or step ID")
    .requiredOption("--project <project>", "Project name")
    .option("--feature <feature>", "Feature name")
    .option("--version <version>", "Target version")
    .option("--input-file <path>", "Path to optional user input file")
    .description("Run a workflow or a single step")
    .action(() => {
      console.log("run is not implemented yet.");
    });
}
