import { readFile } from "node:fs/promises";
import path from "node:path";
import { stepIdToVariable } from "../utils/stepId";

export type PromptVariables = Record<string, string>;

const TEMPLATE_VARIABLE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function buildArtifactVariables(artifactByStepId: Record<string, string>): PromptVariables {
  const variables: PromptVariables = {};

  for (const [stepId, content] of Object.entries(artifactByStepId)) {
    variables[stepIdToVariable(stepId)] = content;
  }

  return variables;
}

export function resolvePromptTemplateString(
  template: string,
  variables: PromptVariables,
  filePathForErrors: string,
): string {
  return template.replace(TEMPLATE_VARIABLE, (_fullMatch: string, variableName: string) => {
    if (!(variableName in variables)) {
      throw new Error(
        `Missing variable '${variableName}' in prompt template ${path.normalize(filePathForErrors)}.`,
      );
    }

    return variables[variableName];
  });
}

export async function resolvePrompt(
  promptTemplatePath: string,
  variables: PromptVariables,
): Promise<string> {
  const template = await readFile(promptTemplatePath, "utf8");
  return resolvePromptTemplateString(template, variables, promptTemplatePath);
}
