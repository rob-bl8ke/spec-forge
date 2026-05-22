import * as path from "path";
import { readFile } from "node:fs/promises";
import { StepDefinition } from "./types";
import {
  resolvePromptTemplateString,
  buildArtifactVariables,
  type PromptVariables,
} from "./resolvePrompt";
import { assembleArtifactContext } from "./assembleArtifactContext";
import { loadAssets } from "./loadAssets";
import { runProviderCall } from "../providers/runProvider";
import {
  validateOutput,
  handleValidationFailure,
} from "./validateOutput";
import {
  persistOutput,
  type PersistOutputInput,
} from "./persistOutput";
import type { ConfigContext } from "../config/types";
import { logger } from "../logging/logger";
import { artifactFileName, slugify } from "../utils/naming";
import { resolveProviderFromContext } from "../providers/providerFactory";

/**
 * Result of executing a single step in the workflow
 */
export interface StepExecutionResult {
  stepId: string;
  success: boolean;
  artifactPath?: string;
  errorMessage?: string;
  outputFile?: string;
}

/**
 * Execute a single workflow step:
 * 1. Assemble the prompt (template resolution + artifact context + assets)
 * 2. Call the provider
 * 3. Validate the output
 * 4. Persist the artifact
 * 5. Handle validation failures
 */
export async function executeStep(
  step: StepDefinition,
  versionDir: string,
  projectName: string,
  featureName: string,
  version: string,
  specForgeRoot: string,
  isFullRun: boolean,
  contexts: {
    configContext: ConfigContext;
    stepArtifacts: Record<string, string>; // Maps step IDs to artifact file paths (for template substitution)
    rootDir: string; // spec-forge root for persistOutput
  }
): Promise<StepExecutionResult> {
  logger.setPrompt(step.prompt); // Log the prompt for this step

  try {
    // Step 1: Resolve prompt template
    // Build core runtime variables
    const coreVariables: PromptVariables = {
      project_name: projectName,
      feature_name: featureName,
      feature_slug: slugify(featureName),
      step_id: step.id,
      user_input: "",
    };

    // Read artifact file content for variable substitution (stepArtifacts maps step IDs → file paths)
    const artifactFileContent: Record<string, string> = {};
    for (const [stepId, filePath] of Object.entries(contexts.stepArtifacts)) {
      try {
        artifactFileContent[stepId] = await readFile(filePath, "utf8");
      } catch {
        artifactFileContent[stepId] = "";
      }
    }
    const artifactVariables = buildArtifactVariables(artifactFileContent);
    const allVariables: PromptVariables = { ...coreVariables, ...artifactVariables };

    // Read prompt template from YAML and resolve variables
    const resolvedPrompt = resolvePromptTemplateString(step.prompt, allVariables, `step "${step.id}"`);

    // Step 2: Assemble artifact context (from input files)
    let artifactContext = "";
    if (step.input && step.input.length > 0) {
      const assembled = await assembleArtifactContext(
        step.input,
        versionDir
      );
      artifactContext = assembled ?? "";
    }

    // Step 3: Load assets (skills/instructions/knowledge)
    const projectAssets =
      contexts.configContext.resolvedProject?.assets ?? {};
    const { composed: assetContent } = await loadAssets(
      specForgeRoot,
      projectAssets
    );

    // Step 4: Compose final prompt with context and assets
    const finalPrompt = [
      resolvedPrompt,
      artifactContext,
      assetContent,
    ]
      .filter((s) => s && s.trim().length > 0)
      .join("\n\n");

    // Step 5: Call provider
    const adapter = resolveProviderFromContext(
      contexts.configContext
    );
    const timeoutMs =
      contexts.configContext.resolvedProject?.providerTimeoutMs ??
      contexts.configContext.globalConfig.provider.timeoutMs;
    const providerResponse = await runProviderCall(
      adapter,
      {
        prompt: finalPrompt,
        timeoutMs,
      },
      contexts.configContext
    );

    // Step 6: Validate output
    const validation = validateOutput(
      step.id,
      providerResponse.stdout
    );

    if (!validation.valid) {
      // Validation failed
      const invalidPath = await handleValidationFailure(
        step.id,
        providerResponse.stdout,
        versionDir,
        validation.error || "Validation failed"
      );

      return {
        stepId: step.id,
        success: false,
        errorMessage: validation.error || "Validation failed",
        outputFile: path.basename(invalidPath),
      };
    }

    // Step 7: Persist valid output
    const persistInput: PersistOutputInput = isFullRun
      ? {
          mode: "full-run",
          rootDir: contexts.rootDir,
          project: projectName,
          feature: featureName,
          stepId: step.id,
          content: providerResponse.stdout,
          version,
        }
      : {
          mode: "step-rerun",
          rootDir: contexts.rootDir,
          project: projectName,
          feature: featureName,
          stepId: step.id,
          content: providerResponse.stdout,
          version,
        };

    const result = await persistOutput(persistInput);

    // Store artifact path for subsequent steps to reference
    contexts.stepArtifacts[step.id] = result.artifactPath;

    return {
      stepId: step.id,
      success: true,
      artifactPath: result.artifactPath,
      outputFile: artifactFileName(step.id),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    return {
      stepId: step.id,
      success: false,
      errorMessage,
    };
  }
}
