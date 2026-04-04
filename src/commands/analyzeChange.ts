import { Command } from "commander";

export function registerAnalyzeChangeCommand(program: Command): void {
  program
    .command("analyze-change")
    .argument("<project>", "Project name")
    .argument("<feature>", "Feature name")
    .argument("<from-version>", "Source version")
    .argument("<to-version>", "Target version")
    .description("Analyze impact between two workflow output versions")
    .action(() => {
      console.log("analyze-change is not implemented yet.");
    });
}
