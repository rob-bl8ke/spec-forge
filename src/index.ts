#!/usr/bin/env node
import { Command } from "commander";
import { initializeCommandContext } from "./config/context";
import { registerInitCommand } from "./commands/init";
import { registerRunCommand } from "./commands/run";
import { registerSyncCommand } from "./commands/sync";
import { registerHarvestCommand } from "./commands/harvest";
import { registerPromoteCommand } from "./commands/promote";
import { registerAnalyzeChangeCommand } from "./commands/analyzeChange";

const program = new Command();

program
  .name("spec-forge")
  .description("Spec Forge CLI")
  .version("0.1.0");

program.hook("preAction", async (_, actionCommand) => {
  await initializeCommandContext({
    commandName: actionCommand.name(),
    args: actionCommand.args,
    options: actionCommand.opts(),
  });
});

registerInitCommand(program);
registerRunCommand(program);
registerSyncCommand(program);
registerHarvestCommand(program);
registerPromoteCommand(program);
registerAnalyzeChangeCommand(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
