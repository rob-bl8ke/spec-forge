import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { artifactFileName, nextVersion } from "../utils/naming";
import { confirmService, type ConfirmService } from "../utils/confirm";

interface OutputBaseInput {
  rootDir: string;
  project: string;
  feature: string;
}

interface PersistFullRunStepInput extends OutputBaseInput {
  mode: "full-run";
  stepId: string;
  content: string;
  version?: string;
}

interface PersistStepRerunInput extends OutputBaseInput {
  mode: "step-rerun";
  stepId: string;
  content: string;
  version: string;
}

export type PersistOutputInput = PersistFullRunStepInput | PersistStepRerunInput;

export interface PersistOutputResult {
  version: string;
  artifactPath: string;
  newArtifactPath?: string;
  replacedCanonical: boolean;
}

function getFeatureOutputRoot(input: OutputBaseInput): string {
  return path.join(input.rootDir, "output", input.project, input.feature);
}

export async function determineNextVersion(rootDir: string, project: string, feature: string): Promise<string> {
  const featureRoot = getFeatureOutputRoot({ rootDir, project, feature });

  let folders: string[] = [];
  try {
    folders = await readdir(featureRoot);
  } catch {
    return "v1";
  }

  const versions = folders
    .map((name) => {
      const match = /^v(\d+)$/.exec(name);
      return match ? Number.parseInt(match[1], 10) : undefined;
    })
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b);

  if (versions.length === 0) {
    return "v1";
  }

  return nextVersion(`v${versions[versions.length - 1]}`);
}

async function resolveVersionDir(input: PersistOutputInput): Promise<{ version: string; versionDir: string }> {
  if (input.mode === "full-run") {
    const version = input.version ?? await determineNextVersion(input.rootDir, input.project, input.feature);
    const versionDir = path.join(getFeatureOutputRoot(input), version);
    await mkdir(versionDir, { recursive: true });
    return { version, versionDir };
  }

  const versionDir = path.join(getFeatureOutputRoot(input), input.version);
  try {
    const details = await stat(versionDir);
    if (!details.isDirectory()) {
      throw new Error();
    }
  } catch {
    throw new Error(`Version folder not found: ${path.normalize(versionDir)}`);
  }

  return { version: input.version, versionDir };
}

export async function persistOutput(
  input: PersistOutputInput,
  confirmer: ConfirmService = confirmService,
): Promise<PersistOutputResult> {
  const { version, versionDir } = await resolveVersionDir(input);
  const baseFile = artifactFileName(input.stepId);
  const artifactPath = path.join(versionDir, baseFile);

  if (input.mode === "full-run") {
    await writeFile(artifactPath, input.content, "utf8");
    return {
      version,
      artifactPath,
      replacedCanonical: true,
    };
  }

  if (input.stepId === "requirements") {
    throw new Error("requirements cannot be rerun. Start a new version with a full workflow run.");
  }

  const newArtifactPath = path.join(versionDir, baseFile.replace(/\.md$/i, ".new.md"));
  await writeFile(newArtifactPath, input.content, "utf8");

  let current = "";
  try {
    current = await readFile(artifactPath, "utf8");
  } catch {
    // If canonical file does not exist yet we still allow replacement confirmation.
  }

  await confirmer.showUnifiedDiff(artifactPath, newArtifactPath, current, input.content);
  const shouldReplace = await confirmer.confirmYesNo(`Replace ${baseFile}? (y/n)`);

  if (shouldReplace) {
    await writeFile(artifactPath, input.content, "utf8");
    await rm(newArtifactPath, { force: true });
  }

  return {
    version,
    artifactPath,
    newArtifactPath: shouldReplace ? undefined : newArtifactPath,
    replacedCanonical: shouldReplace,
  };
}
