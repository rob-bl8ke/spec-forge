import { readFile } from "node:fs/promises";
import path from "node:path";
import { artifactFileName } from "../utils/naming";

export async function assembleArtifactContext(
  inputStepIds: string[] | undefined,
  versionDir: string,
): Promise<string | undefined> {
  if (!inputStepIds || inputStepIds.length === 0) {
    return undefined;
  }

  const blocks: string[] = [];

  for (const stepId of inputStepIds) {
    const artifactPath = path.join(versionDir, artifactFileName(stepId));

    let content: string;
    try {
      content = await readFile(artifactPath, "utf8");
    } catch {
      throw new Error(
        `Missing required artifact '${stepId}' at ${path.normalize(artifactPath)}.`,
      );
    }

    blocks.push(`# ${stepId}\n${content.trimEnd()}`);
  }

  return `--- CONTEXT: ARTIFACTS ---\n${blocks.join("\n---\n")}\n---\n`;
}
