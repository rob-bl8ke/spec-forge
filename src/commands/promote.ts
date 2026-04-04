import { Command } from "commander";
import { getCommandContext } from "../config/context";

export function registerPromoteCommand(program: Command): void {
  program
    .command("promote")
    .argument("<candidate-skill-id>", "Candidate skill ID")
    .description("Promote a candidate skill into the active skill set")
    .action(() => {
      const context = getCommandContext();
      console.log(`promote is not implemented yet. Loaded config from ${context.rootDir}.`);
    });
}
