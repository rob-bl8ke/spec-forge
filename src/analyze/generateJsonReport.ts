import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { slugify } from "../utils/naming";
import type { AnalyzeChangeModel } from "./types";

export interface GenerateJsonReportInput {
  rootDir: string;
  model: AnalyzeChangeModel;
}

export interface GenerateJsonReportResult {
  outputPath: string;
  json: object;
}

export function serializeAnalyzeModel(model: AnalyzeChangeModel): object {
  return {
    project: model.project,
    feature: model.feature,
    fromVersion: model.fromVersion,
    toVersion: model.toVersion,
    summary: model.summary,
    requirementsChanges: model.requirementsChanges,
    architectureChanges: model.architectureChanges,
    jiraTaskImpact: {
      unchanged: model.jiraTaskImpact.unchanged,
      modified: model.jiraTaskImpact.modified,
      removed: model.jiraTaskImpact.removed,
      new: model.jiraTaskImpact.new,
    },
    taskPromptImpact: {
      changed: model.taskPromptImpact.changed,
      summary: model.taskPromptImpact.summary,
    },
    recommendedJiraActions: model.recommendedJiraActions,
  };
}

export async function generateJsonReport(
  input: GenerateJsonReportInput,
  print: (line: string) => void = console.log,
): Promise<GenerateJsonReportResult> {
  const featureSlug = slugify(input.model.feature);
  const outputDir = path.join(input.rootDir, "output", input.model.project, featureSlug);
  await mkdir(outputDir, { recursive: true });

  const outputPath = path.join(
    outputDir,
    `analysis-${input.model.fromVersion}-${input.model.toVersion}.json`,
  );

  const json = serializeAnalyzeModel(input.model);
  const jsonString = JSON.stringify(json, null, 2);
  await writeFile(outputPath, jsonString, "utf8");

  print(outputPath);
  return { outputPath, json };
}
