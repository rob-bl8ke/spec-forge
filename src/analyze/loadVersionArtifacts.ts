import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { slugify } from "../utils/naming";

const CANONICAL_ARTIFACTS = [
  "requirements.md",
  "architecture.md",
  "jira-task.md",
  "task-prompt.md",
] as const;

export type CanonicalArtifactName = (typeof CANONICAL_ARTIFACTS)[number];

export interface LoadVersionArtifactsInput {
  rootDir: string;
  project: string;
  feature: string;
  fromVersion: string;
  toVersion: string;
}

export interface VersionArtifactPair {
  fileName: CanonicalArtifactName;
  fromContent: string;
  toContent: string;
}

export interface LoadVersionArtifactsResult {
  fromDir: string;
  toDir: string;
  pairs: VersionArtifactPair[];
}

export function buildVersionOutputDir(
  rootDir: string,
  project: string,
  feature: string,
  version: string,
): string {
  return path.join(rootDir, "output", project, slugify(feature), version);
}

async function ensureDirectoryExists(dirPath: string, version: string): Promise<void> {
  try {
    await access(dirPath);
  } catch {
    throw new Error(`Missing version folder '${version}': ${dirPath}`);
  }
}

async function readRequiredArtifact(dirPath: string, fileName: CanonicalArtifactName): Promise<string> {
  const filePath = path.join(dirPath, fileName);
  try {
    return await readFile(filePath, "utf8");
  } catch {
    throw new Error(`Missing canonical artifact '${fileName}': ${filePath}`);
  }
}

export async function loadVersionArtifacts(
  input: LoadVersionArtifactsInput,
): Promise<LoadVersionArtifactsResult> {
  const fromDir = buildVersionOutputDir(
    input.rootDir,
    input.project,
    input.feature,
    input.fromVersion,
  );
  const toDir = buildVersionOutputDir(
    input.rootDir,
    input.project,
    input.feature,
    input.toVersion,
  );

  await ensureDirectoryExists(fromDir, input.fromVersion);
  await ensureDirectoryExists(toDir, input.toVersion);

  const pairs: VersionArtifactPair[] = [];
  for (const fileName of CANONICAL_ARTIFACTS) {
    const fromContent = await readRequiredArtifact(fromDir, fileName);
    const toContent = await readRequiredArtifact(toDir, fileName);
    pairs.push({ fileName, fromContent, toContent });
  }

  return {
    fromDir,
    toDir,
    pairs,
  };
}

export { CANONICAL_ARTIFACTS };