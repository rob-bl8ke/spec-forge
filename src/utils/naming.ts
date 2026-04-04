import path from "node:path";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function nextVersion(current: string | undefined): string {
  if (!current) {
    return "v1";
  }

  const match = /^v(\d+)$/.exec(current);
  if (!match) {
    throw new Error(`Invalid version string: ${current}. Expected format v<number>.`);
  }

  return `v${Number.parseInt(match[1], 10) + 1}`;
}

export function outputPath(project: string, feature: string, version: string): string {
  return path.join("spec-forge", "output", project, feature, version);
}

export function artifactFileName(stepId: string): string {
  return `${stepId}.md`;
}
