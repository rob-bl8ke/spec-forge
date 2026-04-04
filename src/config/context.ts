import type { ConfigContext } from "./types";
import { loadConfig } from "./loadConfig";

let currentContext: ConfigContext | undefined;

interface InitializeContextInput {
  commandName: string;
  args: unknown[];
  options: Record<string, unknown>;
  cwd?: string;
}

function inferProjectName(input: InitializeContextInput): string | undefined {
  if (typeof input.options.project === "string" && input.options.project.trim().length > 0) {
    return input.options.project;
  }

  if (input.commandName === "sync" || input.commandName === "harvest" || input.commandName === "analyze-change") {
    const firstArg = input.args[0];
    return typeof firstArg === "string" && firstArg.trim().length > 0 ? firstArg : undefined;
  }

  return undefined;
}

export async function initializeCommandContext(input: InitializeContextInput): Promise<ConfigContext | undefined> {
  const projectName = inferProjectName(input);
  const context = await loadConfig({ cwd: input.cwd, projectName });
  currentContext = context;
  return context;
}

export function getCommandContext(): ConfigContext {
  if (!currentContext) {
    throw new Error("Command context has not been initialized for this command.");
  }

  return currentContext;
}
