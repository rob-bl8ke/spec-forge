import { Command } from "commander";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { getCommandContext } from "../config/context";
import { loadWorkflow } from "../workflow/loadWorkflow";
import type { WorkflowDefinition } from "../workflow/types";

export interface RunCommandOptions {
  project: string;
  feature?: string;
  version?: string;
  inputFile?: string;
}

export type RunTarget =
  | { kind: "workflow"; workflowId: string }
  | { kind: "step"; workflowId: string; stepId: string };

export interface RunDispatchPayload {
  target: RunTarget;
  options: RunCommandOptions;
}

export type RunDispatcher = (payload: RunDispatchPayload) => Promise<void>;

async function defaultDispatcher(payload: RunDispatchPayload): Promise<void> {
  if (payload.target.kind === "workflow") {
    console.log(
      `run dispatch: workflow=${payload.target.workflowId} project=${payload.options.project} feature=${payload.options.feature ?? ""} version=${payload.options.version ?? ""}`,
    );
    return;
  }

  console.log(
    `run dispatch: step=${payload.target.stepId} workflow=${payload.target.workflowId} project=${payload.options.project} feature=${payload.options.feature ?? ""} version=${payload.options.version ?? ""}`,
  );
}

export async function loadAllWorkflows(rootDir: string): Promise<WorkflowDefinition[]> {
  const workflowsDir = path.join(rootDir, "workflows");

  let files: string[];
  try {
    files = await readdir(workflowsDir);
  } catch {
    throw new Error(`Workflow directory not found: ${path.normalize(workflowsDir)}`);
  }

  const workflowIds = files
    .filter((file) => /\.ya?ml$/i.test(file))
    .map((file) => file.replace(/\.ya?ml$/i, ""));

  const workflows: WorkflowDefinition[] = [];
  for (const workflowId of workflowIds) {
    workflows.push(await loadWorkflow(workflowId, rootDir));
  }

  return workflows;
}

export function resolveRunTarget(name: string, workflows: WorkflowDefinition[]): RunTarget {
  const workflowMatch = workflows.find((workflow) => workflow.id === name);
  if (workflowMatch) {
    return {
      kind: "workflow",
      workflowId: workflowMatch.id,
    };
  }

  for (const workflow of workflows) {
    const stepMatch = workflow.steps.find((step) => step.id === name);
    if (stepMatch) {
      return {
        kind: "step",
        workflowId: workflow.id,
        stepId: stepMatch.id,
      };
    }
  }

  const workflowIds = workflows.map((workflow) => workflow.id).sort();
  const stepIds = Array.from(new Set(workflows.flatMap((workflow) => workflow.steps.map((step) => step.id)))).sort();
  throw new Error(
    `Unknown workflow-or-step '${name}'. Available workflows: ${workflowIds.join(", ") || "none"}. Available steps: ${stepIds.join(", ") || "none"}.`,
  );
}

export async function runCommandHandler(
  rootDir: string,
  workflowOrStep: string,
  options: RunCommandOptions,
  dispatcher: RunDispatcher = defaultDispatcher,
): Promise<void> {
  const workflows = await loadAllWorkflows(rootDir);
  const target = resolveRunTarget(workflowOrStep, workflows);
  await dispatcher({
    target,
    options,
  });
}

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .argument("<workflow-or-step>", "Workflow ID or step ID")
    .requiredOption("--project <project>", "Project name")
    .option("--feature <feature>", "Feature name")
    .option("--version <version>", "Target version")
    .option("--input-file <path>", "Path to optional user input file")
    .description("Run a workflow or a single step")
    .action(async (workflowOrStep: string, options: RunCommandOptions) => {
      const context = getCommandContext();
      await runCommandHandler(context.rootDir, workflowOrStep, options);
    });
}
