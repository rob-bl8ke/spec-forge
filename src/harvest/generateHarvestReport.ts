import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolvePromptTemplateString } from "../workflow/resolvePrompt";
import type { ConfigContext } from "../config/types";
import { resolveProviderFromContext } from "../providers/providerFactory";
import { runProviderCall } from "../providers/runProvider";

const DEFAULT_PROMPT_PATH = path.join("prompts", "harvest", "harvest-report.md");
const REQUIRED_SECTIONS = [
  "# Harvest Report",
  "## Summary",
  "## High-Value Findings",
  "## Candidate Skills Created",
  "## Recommended Promotions",
];

export interface HarvestReportPattern {
  path: string;
  content: string;
}

export interface GenerateHarvestReportInput {
  rootDir: string;
  projectName: string;
  patterns: HarvestReportPattern[];
  context: ConfigContext;
  promptTemplatePath?: string;
}

export interface GenerateHarvestReportResult {
  outputPath: string;
}

export type HarvestReportInvoker = (prompt: string, context: ConfigContext) => Promise<string>;

function defaultPromptPath(rootDir: string): string {
  return path.join(rootDir, DEFAULT_PROMPT_PATH);
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildPatternSummaries(patterns: HarvestReportPattern[]): string {
  if (patterns.length === 0) {
    return "No pattern summaries were found for this harvest run.";
  }

  return patterns.map((pattern) => pattern.content.trim()).join("\n\n---\n\n");
}

async function defaultInvokeProvider(prompt: string, context: ConfigContext): Promise<string> {
  const adapter = resolveProviderFromContext(context);
  const timeoutMs =
    context.resolvedProject?.providerTimeoutMs ?? context.globalConfig.provider.timeoutMs;

  const response = await runProviderCall(
    adapter,
    {
      prompt,
      timeoutMs,
    },
    context,
  );

  return response.stdout;
}

export function validateHarvestReport(content: string): { valid: boolean; error?: string } {
  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) {
      return { valid: false, error: `missing required section '${section}'` };
    }
  }

  return { valid: true };
}

export async function generateHarvestReport(
  input: GenerateHarvestReportInput,
  invokeProvider: HarvestReportInvoker = defaultInvokeProvider,
  print: (line: string) => void = console.log,
  now: () => Date = () => new Date(),
): Promise<GenerateHarvestReportResult> {
  const promptPath = input.promptTemplatePath ?? defaultPromptPath(input.rootDir);
  const template = await readFile(promptPath, "utf8");
  const prompt = resolvePromptTemplateString(
    template,
    {
      project_name: input.projectName,
      pattern_summaries: buildPatternSummaries(input.patterns),
    },
    promptPath,
  );

  const output = (await invokeProvider(prompt, input.context)).trim();
  const validation = validateHarvestReport(output);
  if (!validation.valid) {
    throw new Error(`Invalid harvest report: ${validation.error}`);
  }

  const reportDir = path.join(input.rootDir, "harvested", "reports");
  await mkdir(reportDir, { recursive: true });

  const outputPath = path.join(
    reportDir,
    `${input.projectName}-${formatTimestamp(now())}.md`,
  );

  await writeFile(outputPath, `${output}\n`, "utf8");
  print(outputPath);

  return { outputPath };
}