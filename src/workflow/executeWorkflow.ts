import { mkdir } from "fs/promises";
import * as path from "path";
import { StepDefinition } from "./types";
import { executeStep, StepExecutionResult } from "./executeStep";
import type { ConfigContext } from "../config/types";
import { logger } from "../logging/logger";

/**
 * Result of executing a full workflow
 */
export interface WorkflowExecutionResult {
  success: boolean;
  stepsExecuted: number;
  stepResults: StepExecutionResult[];
  versionDir: string;
  version: string;
  stoppedAtStep?: string;
  errorMessage?: string;
}

/**
 * Execute a full workflow (spec-to-tasks):
 * 1. Create the version folder
 * 2. Iterate through each step in sequence
 * 3. Execute each step (assemble prompt → call provider → validate → persist)
 * 4. Stop on first failure, preserving prior valid outputs
 * 5. Print progress to stdout
 */
export async function executeWorkflow(
  steps: StepDefinition[],
  versionDir: string,
  version: string,
  projectName: string,
  featureName: string,
  specForgeRoot: string,
  rootDir: string,
  configContext: ConfigContext
): Promise<WorkflowExecutionResult> {
  try {
    // Step 1: Create version folder
    console.log(`Creating version folder: ${versionDir}`);
    await mkdir(versionDir, { recursive: true });

    const stepResults: StepExecutionResult[] = [];
    const stepArtifacts: Record<string, string> = {}; // Maps step IDs to paths

    // Step 2: Iterate through each step
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const isFirstStep = i === 0;

      console.log(`\n[${step.id}] Starting step...`);

      const result = await executeStep(
        step,
        versionDir,
        projectName,
        featureName,
        version,
        specForgeRoot,
        isFirstStep, // Only the first step is part of the full-run workflow
        {
          configContext,
          stepArtifacts,
          rootDir,
        }
      );

      stepResults.push(result);

      if (result.success) {
        console.log(`[${step.id}] ✓ Step completed successfully`);
        if (result.outputFile) {
          console.log(`[${step.id}] Output: ${result.outputFile}`);
        }
      } else {
        // First failure stops execution
        console.log(`[${step.id}] ✗ Step failed: ${result.errorMessage}`);
        if (result.outputFile) {
          console.log(
            `[${step.id}] Invalid output written to: ${result.outputFile}`
          );
        }

        // Return early, preserving prior valid outputs
        return {
          success: false,
          stepsExecuted: stepResults.length,
          stepResults,
          versionDir,
          version,
          stoppedAtStep: step.id,
          errorMessage: result.errorMessage,
        };
      }
    }

    // All steps completed successfully
    console.log(`\n✓ Workflow completed successfully`);
    console.log(`Version folder: ${versionDir}`);

    return {
      success: true,
      stepsExecuted: stepResults.length,
      stepResults,
      versionDir,
      version,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    console.log(`\n✗ Workflow failed: ${errorMessage}`);

    return {
      success: false,
      stepsExecuted: 0,
      stepResults: [],
      versionDir,
      version: "",
      errorMessage,
    };
  }
}
