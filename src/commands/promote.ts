import { Command } from "commander";

export function registerPromoteCommand(program: Command): void {
  program
    .command("promote")
    .argument("<candidate-skill-id>", "Candidate skill ID")
    .description("Promote a candidate skill into the active skill set")
    .action(() => {
      console.log("promote is not implemented yet.");
    });
}
