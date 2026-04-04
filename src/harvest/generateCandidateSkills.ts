import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { resolvePromptTemplateString } from "../workflow/resolvePrompt";
import type { ConfigContext } from "../config/types";
import { resolveProviderFromContext } from "../providers/providerFactory";
import { runProviderCall } from "../providers/runProvider";

const DEFAULT_PROMPT_PATH = path.join("prompts", "harvest", "candidate-skill.md");
const VALID_CONFIDENCE = new Set(["low", "medium", "high"]);

export interface CandidateSkillPattern {
  path: string;
  content: string;
}

export interface GenerateCandidateSkillsInput {
  rootDir: string;
  patterns: CandidateSkillPattern[];
  context: ConfigContext;
  promptTemplatePath?: string;
}

export interface GenerateCandidateSkillsResult {
  writtenFiles: string[];
  invalid: number;
  providerFailures: number;
}

export type CandidateSkillInvoker = (prompt: string, context: ConfigContext) => Promise<string>;

function defaultPromptPath(rootDir: string): string {
  return path.join(rootDir, DEFAULT_PROMPT_PATH);
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

function extractFrontmatter(content: string): { frontmatter: string; body: string } | undefined {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return undefined;
  }

  return {
    frontmatter: match[1],
    body: match[2],
  };
}

function hasRequiredSections(body: string): boolean {
  return body.includes("# Description")
    && body.includes("# Guidance")
    && body.includes("# Examples");
}

function validateCandidateSkill(content: string): { valid: boolean; id?: string; error?: string } {
  const parts = extractFrontmatter(content);
  if (!parts) {
    return { valid: false, error: "missing YAML frontmatter" };
  }

  let data: unknown;
  try {
    data = parse(parts.frontmatter);
  } catch (error: unknown) {
    return {
      valid: false,
      error: `invalid YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (typeof data !== "object" || data === null) {
    return { valid: false, error: "frontmatter must be a YAML object" };
  }

  const frontmatter = data as Record<string, unknown>;
  const requiredFields = ["id", "type", "version", "source", "confidence"];
  for (const field of requiredFields) {
    const value = frontmatter[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      return { valid: false, error: `missing required frontmatter field '${field}'` };
    }
  }

  if (frontmatter.type !== "skill") {
    return { valid: false, error: "frontmatter field 'type' must be 'skill'" };
  }

  if (frontmatter.source !== "harvested") {
    return { valid: false, error: "frontmatter field 'source' must be 'harvested'" };
  }

  if (!VALID_CONFIDENCE.has(String(frontmatter.confidence))) {
    return { valid: false, error: "frontmatter field 'confidence' must be one of low, medium, high" };
  }

  if (!hasRequiredSections(parts.body)) {
    return { valid: false, error: "missing required sections" };
  }

  return { valid: true, id: String(frontmatter.id) };
}

export async function generateCandidateSkills(
  input: GenerateCandidateSkillsInput,
  invokeProvider: CandidateSkillInvoker = defaultInvokeProvider,
  print: (line: string) => void = console.log,
): Promise<GenerateCandidateSkillsResult> {
  const promptPath = input.promptTemplatePath ?? defaultPromptPath(input.rootDir);
  const template = await readFile(promptPath, "utf8");

  const outputDir = path.join(input.rootDir, "harvested", "candidate-skills");
  await mkdir(outputDir, { recursive: true });

  const writtenFiles: string[] = [];
  let invalid = 0;
  let providerFailures = 0;

  for (const pattern of input.patterns) {
    const prompt = resolvePromptTemplateString(
      template,
      {
        pattern_summary: pattern.content,
      },
      promptPath,
    );

    let output: string;
    try {
      output = await invokeProvider(prompt, input.context);
    } catch (error: unknown) {
      providerFailures += 1;
      const message = error instanceof Error ? error.message : String(error);
      print(`Candidate skill generation failed for ${pattern.path}: ${message}`);
      continue;
    }

    const validation = validateCandidateSkill(output.trim());
    if (!validation.valid || !validation.id) {
      invalid += 1;
      print(`Invalid candidate skill for ${pattern.path}: ${validation.error}`);
      continue;
    }

    const outputPath = path.join(outputDir, `${validation.id}.md`);
    await writeFile(outputPath, `${output.trim()}\n`, "utf8");
    writtenFiles.push(outputPath);
    print(`WROTE ${outputPath}`);
  }

  return {
    writtenFiles,
    invalid,
    providerFailures,
  };
}

export { validateCandidateSkill };
