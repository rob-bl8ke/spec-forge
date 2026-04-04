import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { slugify } from "../utils/naming";
import type { AnalyzeChangeModel } from "./types";

export interface GenerateMarkdownReportInput {
  rootDir: string;
  model: AnalyzeChangeModel;
}

export interface GenerateMarkdownReportResult {
  outputPath: string;
  markdown: string;
}

function renderList(items: string[]): string[] {
  if (items.length === 0) {
    return ["- None"];
  }

  return items.map((item) => `- ${item}`);
}

function renderTaskReferences(items: Array<{ taskId: string; title: string }>): string[] {
  if (items.length === 0) {
    return ["- None"];
  }

  return items.map((item) => `- ${item.taskId}: ${item.title}`);
}

function renderModifiedTasks(
  items: Array<{ taskId: string; title: string; change: string; recommendedJiraUpdate: string }>,
): string[] {
  if (items.length === 0) {
    return ["- None"];
  }

  return items.flatMap((item) => [
    `- ${item.taskId}: ${item.title}`,
    `  - Change: ${item.change}`,
    `  - Recommended Update: ${item.recommendedJiraUpdate}`,
  ]);
}

function renderRemovedTasks(items: Array<{ taskId: string; title: string; reason: string }>): string[] {
  if (items.length === 0) {
    return ["- None"];
  }

  return items.flatMap((item) => [
    `- ${item.taskId}: ${item.title}`,
    `  - Reason: ${item.reason}`,
  ]);
}

function renderNewTasks(
  items: Array<{ taskId: string; title: string; reason: string; suggestedDescription: string }>,
): string[] {
  if (items.length === 0) {
    return ["- None"];
  }

  return items.flatMap((item) => [
    `- ${item.taskId}: ${item.title}`,
    `  - Reason: ${item.reason}`,
    `  - Suggested Description: ${item.suggestedDescription}`,
  ]);
}

export function renderMarkdownReport(model: AnalyzeChangeModel): string {
  const lines: string[] = [
    `# Change Analysis: ${model.fromVersion} -> ${model.toVersion}`,
    "",
    "## Summary",
    model.summary,
    "",
    "## Requirements Changes",
    ...renderList(model.requirementsChanges),
    "",
    "## Architecture Changes",
    ...renderList(model.architectureChanges),
    "",
    "## Jira Task Impact",
    "",
    "### Unchanged Tasks",
    ...renderTaskReferences(model.jiraTaskImpact.unchanged),
    "",
    "### Modified Tasks",
    ...renderModifiedTasks(model.jiraTaskImpact.modified),
    "",
    "### Removed Tasks",
    ...renderRemovedTasks(model.jiraTaskImpact.removed),
    "",
    "### New Tasks",
    ...renderNewTasks(model.jiraTaskImpact.new),
    "",
    "## Task Prompt Impact",
    `- Changed: ${model.taskPromptImpact.changed ? "yes" : "no"}`,
    `- Summary: ${model.taskPromptImpact.summary}`,
    "",
    "## Recommended Jira Actions",
    ...renderList(model.recommendedJiraActions),
  ];

  return `${lines.join("\n")}\n`;
}

export async function generateMarkdownReport(
  input: GenerateMarkdownReportInput,
  print: (line: string) => void = console.log,
): Promise<GenerateMarkdownReportResult> {
  const featureSlug = slugify(input.model.feature);
  const outputDir = path.join(input.rootDir, "output", input.model.project, featureSlug);
  await mkdir(outputDir, { recursive: true });

  const outputPath = path.join(
    outputDir,
    `analysis-${input.model.fromVersion}-${input.model.toVersion}.md`,
  );

  const markdown = renderMarkdownReport(input.model);
  await writeFile(outputPath, markdown, "utf8");

  print(outputPath);
  return { outputPath, markdown };
}
