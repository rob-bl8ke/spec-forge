import { Command } from "commander";
import { getCommandContext } from "../config/context";

export function registerAnalyzeChangeCommand(program: Command): void {
  program
    .command("analyze-change")
    .argument("<project>", "Project name")
    .argument("<feature>", "Feature name")
    .argument("<from-version>", "Source version")
    .argument("<to-version>", "Target version")
    .description("Analyze impact between two workflow output versions")
    .action(() => {
      const context = getCommandContext();
      console.log(`analyze-change is not implemented yet. Loaded config from ${context.rootDir}.`);
    });
}
