import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolvePromptTemplateString } from "../workflow/resolvePrompt";
import { slugify } from "../utils/naming";
import type { ConfigContext } from "../config/types";
import { resolveProviderFromContext } from "../providers/providerFactory";
import { runProviderCall } from "../providers/runProvider";
import { deduplicatePattern, extractPatternTitle } from "./deduplicatePatterns";

const DEFAULT_PROMPT_PATH = path.join("prompts", "harvest", "pattern-extraction.md");

export interface ExtractPatternCommit {
  sha: string;
  message: string;
  diffText: string;
}

export interface ExtractPatternsInput {
  rootDir: string;
  projectName: string;
  probeName: string;
  commits: ExtractPatternCommit[];
  context: ConfigContext;
  promptTemplatePath?: string;
}

export interface ExtractPatternsResult {
  writtenFiles: string[];
  skippedNone: number;
  invalid: number;
  providerFailures: number;
  deduplicated: number;
}

export type ProviderInvoker = (prompt: string, context: ConfigContext) => Promise<string>;

function defaultPromptPath(rootDir: string): string {
  return path.join(rootDir, DEFAULT_PROMPT_PATH);
}

function formatTimestamp(date: Date): string {
  // 2026-04-04T10:15:00.123Z -> 20260404T101500Z
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function extractTitleSlug(content: string, fallback: string): string {
  const title = extractPatternTitle(content);
  if (!title) {
    return fallback;
  }

  const slug = slugify(title);
  return slug.length > 0 ? slug : fallback;
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

function isValidPatternResponse(output: string): boolean {
  return output.includes("# Pattern Summary");
}

/**
 * Executes pattern extraction over eligible commits.
 * - Loads prompt template and substitutes variables per commit.
 * - Calls provider once per commit.
 * - Skips exact NONE responses.
 * - Writes valid patterns under harvested/patterns.
 * - Logs and continues on provider failures/invalid outputs.
 */
export async function extractPatterns(
  input: ExtractPatternsInput,
  invokeProvider: ProviderInvoker = defaultInvokeProvider,
  print: (line: string) => void = console.log,
): Promise<ExtractPatternsResult> {
  const promptPath = input.promptTemplatePath ?? defaultPromptPath(input.rootDir);
  const template = await readFile(promptPath, "utf8");

  const patternDir = path.join(input.rootDir, "harvested", "patterns");
  await mkdir(patternDir, { recursive: true });

  const writtenFiles: string[] = [];
  let skippedNone = 0;
  let invalid = 0;
  let providerFailures = 0;
  let deduplicated = 0;
  const seenTitles = new Set<string>();

  for (const commit of input.commits) {
    const prompt = resolvePromptTemplateString(
      template,
      {
        project_name: input.projectName,
        probe_name: input.probeName,
        diff_input: `sha: ${commit.sha}\nmessage: ${commit.message}\n\n${commit.diffText}`,
      },
      promptPath,
    );

    let output: string;
    try {
      output = await invokeProvider(prompt, input.context);
    } catch (error: unknown) {
      providerFailures += 1;
      const message = error instanceof Error ? error.message : String(error);
      print(`Pattern extraction failed for ${commit.sha}: ${message}`);
      continue;
    }

    const normalized = output.trim();

    if (normalized === "NONE") {
      skippedNone += 1;
      continue;
    }

    if (!isValidPatternResponse(normalized)) {
      invalid += 1;
      print(`Invalid pattern output for ${commit.sha}: missing '# Pattern Summary'`);
      continue;
    }

    const dedupe = deduplicatePattern(normalized, seenTitles);
    if (!dedupe.keep) {
      deduplicated += 1;
      print(`Duplicate pattern discarded for ${commit.sha}: ${dedupe.normalizedTitle}`);
      continue;
    }

    const timestamp = formatTimestamp(new Date());
    const slug = extractTitleSlug(normalized, commit.sha.slice(0, 8).toLowerCase());
    const filePath = path.join(patternDir, `${input.projectName}-${timestamp}-${slug}.md`);

    await writeFile(filePath, `${normalized}\n`, "utf8");
    writtenFiles.push(filePath);
    print(`WROTE ${filePath}`);
  }

  return {
    writtenFiles,
    skippedNone,
    invalid,
    providerFailures,
    deduplicated,
  };
}
