import { Command } from "commander";
import { getCommandContext } from "../config/context";
import { promoteSkill } from "../harvest/promoteSkill";
import { confirmService } from "../utils/confirm";

export function registerPromoteCommand(program: Command): void {
  program
    .command("promote")
    .argument("<candidate-skill-id>", "Candidate skill ID")
    .description("Promote a candidate skill into the active skill set")
    .action(async (candidateSkillId: string) => {
      const context = getCommandContext();
      const result = await promoteSkill(
        { rootDir: context.rootDir, candidateSkillId },
        (prompt) => confirmService.confirmYesNo(prompt),
      );
      if (!result.promoted && !result.aborted) {
        process.exitCode = 1;
      }
    });
}
