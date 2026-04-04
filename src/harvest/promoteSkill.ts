import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

const VALID_CONFIDENCE = new Set(["low", "medium", "high"]);

export interface PromoteSkillInput {
  rootDir: string;
  candidateSkillId: string;
}

export interface PromoteSkillResult {
  promoted: boolean;
  aborted: boolean;
  error?: string;
}

export type FileExistsChecker = (filePath: string) => Promise<boolean>;
export type FileContentReader = (filePath: string) => Promise<string>;
export type FileCopier = (src: string, dest: string) => Promise<void>;
export type DirCreator = (dirPath: string) => Promise<void>;
export type Confirmer = (prompt: string) => Promise<boolean>;

function extractFrontmatter(content: string): { frontmatter: string; body: string } | undefined {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return undefined;
  }
  return { frontmatter: match[1], body: match[2] };
}

export function validateForPromotion(content: string): { valid: boolean; id?: string; error?: string } {
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

  if (!VALID_CONFIDENCE.has(String(frontmatter.confidence))) {
    return { valid: false, error: "frontmatter field 'confidence' must be one of low, medium, high" };
  }

  const required = ["# Description", "# Guidance", "# Examples"];
  for (const section of required) {
    if (!parts.body.includes(section)) {
      return { valid: false, error: `missing required section '${section}'` };
    }
  }

  return { valid: true, id: String(frontmatter.id) };
}

async function defaultFileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function defaultReadFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

async function defaultCopyFile(src: string, dest: string): Promise<void> {
  await copyFile(src, dest);
}

async function defaultMkdir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function promoteSkill(
  input: PromoteSkillInput,
  confirmer: Confirmer,
  print: (line: string) => void = console.log,
  fileExists: FileExistsChecker = defaultFileExists,
  readFileContent: FileContentReader = defaultReadFile,
  copyFileContent: FileCopier = defaultCopyFile,
  mkdirContent: DirCreator = defaultMkdir,
): Promise<PromoteSkillResult> {
  const candidatePath = path.join(
    input.rootDir,
    "harvested",
    "candidate-skills",
    `${input.candidateSkillId}.md`,
  );

  const candidateExists = await fileExists(candidatePath);
  if (!candidateExists) {
    print(`Error: candidate skill '${input.candidateSkillId}' not found at ${candidatePath}`);
    return { promoted: false, aborted: false, error: `candidate skill '${input.candidateSkillId}' not found` };
  }

  const content = await readFileContent(candidatePath);
  const validation = validateForPromotion(content);
  if (!validation.valid) {
    print(`Error: ${validation.error}`);
    return { promoted: false, aborted: false, error: validation.error };
  }

  const skillsDir = path.join(input.rootDir, "skills");
  const destPath = path.join(skillsDir, `${input.candidateSkillId}.md`);

  const destExists = await fileExists(destPath);
  if (destExists) {
    const confirmed = await confirmer(`Skill '${input.candidateSkillId}' already exists. Overwrite? (y/n)`);
    if (!confirmed) {
      print("Promotion aborted. No files were changed.");
      return { promoted: false, aborted: true };
    }
  }

  await mkdirContent(skillsDir);
  await copyFileContent(candidatePath, destPath);

  print(`Promoted: ${input.candidateSkillId}`);
  return { promoted: true, aborted: false };
}
