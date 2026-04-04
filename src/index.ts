#!/usr/bin/env node
import { Command } from "commander";
import { initializeCommandContext } from "./config/context";
import { logger } from "./logging/logger";
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

function getProjectName(commandName: string, args: unknown[], options: Record<string, unknown>): string | undefined {
  if (typeof options.project === "string" && options.project.trim().length > 0) {
    return options.project;
  }

  if (commandName === "sync" || commandName === "harvest" || commandName === "analyze-change") {
    const firstArg = args[0];
    return typeof firstArg === "string" && firstArg.trim().length > 0 ? firstArg : undefined;
  }

  return undefined;
}

program.hook("preAction", async (_, actionCommand) => {
  const options = actionCommand.opts<Record<string, unknown>>();
  const args = actionCommand.args;
  const context = await initializeCommandContext({
    commandName: actionCommand.name(),
    args,
    options,
  });

  if (!context) {
    return;
  }

  await logger.startCommand({
    rootDir: context.rootDir,
    command: actionCommand.name(),
    project: getProjectName(actionCommand.name(), args, options),
    feature: typeof options.feature === "string" ? options.feature : undefined,
    version: typeof options.version === "string" ? options.version : undefined,
    step: actionCommand.name() === "run" && typeof args[0] === "string" ? args[0] : undefined,
    provider: context.resolvedProvider,
    logLevel: context.globalConfig.logging.level,
    writePromptFiles: context.globalConfig.logging.writePromptFiles,
  });
});

program.hook("postAction", async () => {
  await logger.endCommand("success");
});

registerInitCommand(program);
registerRunCommand(program);
registerSyncCommand(program);
registerHarvestCommand(program);
registerPromoteCommand(program);
registerAnalyzeChangeCommand(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  void logger.endCommand("failure", message);
  console.error(message);
  process.exitCode = 1;
});
