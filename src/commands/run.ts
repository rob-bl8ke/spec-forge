import { Command } from "commander";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { getCommandContext } from "../config/context";
import { loadWorkflow } from "../workflow/loadWorkflow";
import { executeWorkflow } from "../workflow/executeWorkflow";
import { executeStep } from "../workflow/executeStep";
import { determineNextVersion } from "../workflow/persistOutput";
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

export type RunDispatcher = (
  payload: RunDispatchPayload,
  rootDir: string
) => Promise<void>;

async function defaultDispatcher(
  payload: RunDispatchPayload,
  rootDir: string
): Promise<void> {
  const context = getCommandContext();

  if (payload.target.kind === "workflow") {
    // Full workflow run
    console.log(`Running workflow: ${payload.target.workflowId}`);
    const workflow = await loadWorkflow(
      payload.target.workflowId,
      rootDir
    );

    const feature =
      payload.options.feature ||
      payload.target.workflowId;
    const version = await determineNextVersion(
      rootDir,
      payload.options.project,
      feature
    );
    const versionDir = path.join(
      rootDir,
      "output",
      payload.options.project,
      feature,
      version
    );

    const result = await executeWorkflow(
      workflow.steps,
      versionDir,
      version,
      payload.options.project,
      feature,
      rootDir,
      rootDir,
      context
    );

    if (!result.success) {
      throw new Error(
        `Workflow failed at step ${result.stoppedAtStep}: ${result.errorMessage}`
      );
    }

    return;
  }

  // Step rerun
  if (payload.target.kind !== "step") {
    throw new Error("Invalid target for step rerun");
  }

  const stepTarget = payload.target as { kind: "step"; workflowId: string; stepId: string };

  if (!payload.options.version) {
    throw new Error(
      "version is required for step reruns (use --version <version>)"
    );
  }

  const workflow = await loadWorkflow(
    stepTarget.workflowId,
    rootDir
  );
  const step = workflow.steps.find(
    (s) => s.id === stepTarget.stepId
  );
  if (!step) {
    throw new Error(
      `Step ${stepTarget.stepId} not found in workflow ${stepTarget.workflowId}`
    );
  }

  const feature = payload.options.feature || stepTarget.workflowId;
  const versionDir = path.join(
    rootDir,
    "output",
    payload.options.project,
    feature,
    payload.options.version
  );

  // For reruns, we need to load prior artifacts to build artifact context
  const stepArtifacts: Record<string, string> = {};
  for (const s of workflow.steps) {
    if (s.id === step.id) {
      break; // Stop at the rerun step
    }
    // Load prior step artifacts for context
    const artifactPath = path.join(versionDir, s.output);
    stepArtifacts[s.id] = artifactPath;
  }

  const result = await executeStep(
    step,
    versionDir,
    payload.options.project,
    feature,
    payload.options.version,
    rootDir,
    false, // Not a full run, just a step rerun
    {
      configContext: context,
      stepArtifacts,
      rootDir,
    }
  );

  if (!result.success) {
    throw new Error(`Step ${step.id} failed: ${result.errorMessage}`);
  }
}

export async function loadAllWorkflows(
  rootDir: string
): Promise<WorkflowDefinition[]> {
  const workflowsDir = path.join(rootDir, "workflows");

  let files: string[];
  try {
    files = await readdir(workflowsDir);
  } catch {
    throw new Error(
      `Workflow directory not found: ${path.normalize(workflowsDir)}`
    );
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

export function resolveRunTarget(
  name: string,
  workflows: WorkflowDefinition[]
): RunTarget {
  const workflowMatch = workflows.find(
    (workflow) => workflow.id === name
  );
  if (workflowMatch) {
    return {
      kind: "workflow",
      workflowId: workflowMatch.id,
    };
  }

  for (const workflow of workflows) {
    const stepMatch = workflow.steps.find(
      (step) => step.id === name
    );
    if (stepMatch) {
      return {
        kind: "step",
        workflowId: workflow.id,
        stepId: stepMatch.id,
      };
    }
  }

  const workflowIds = workflows.map((workflow) => workflow.id).sort();
  const stepIds = Array.from(
    new Set(
      workflows.flatMap((workflow) =>
        workflow.steps.map((step) => step.id)
      )
    )
  ).sort();
  throw new Error(
    `Unknown workflow-or-step '${name}'. Available workflows: ${
      workflowIds.join(", ") || "none"
    }. Available steps: ${stepIds.join(", ") || "none"}.`
  );
}

export async function runCommandHandler(
  rootDir: string,
  workflowOrStep: string,
  options: RunCommandOptions,
  dispatcher: RunDispatcher = defaultDispatcher
): Promise<void> {
  const workflows = await loadAllWorkflows(rootDir);
  const target = resolveRunTarget(workflowOrStep, workflows);
  await dispatcher(
    {
      target,
      options,
    },
    rootDir
  );
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
    .action(
      async (
        workflowOrStep: string,
        options: RunCommandOptions
      ) => {
        const context = getCommandContext();
        await runCommandHandler(
          context.rootDir,
          workflowOrStep,
          options
        );
      }
    );
}
