import { readFile } from "node:fs/promises";
import path from "node:path";

export interface ProjectAssetsConfig {
  skills?: string[];
  instructions?: string[];
  knowledge?: string[];
}

export interface LoadedAssets {
  instructionsSection?: string;
  skillsSection?: string;
  knowledgeSection?: string;
  composed?: string;
}

async function loadAssetSection(
  rootDir: string,
  assetType: "skills" | "instructions" | "knowledge",
  ids: string[] | undefined,
): Promise<string | undefined> {
  if (!ids || ids.length === 0) {
    return undefined;
  }

  const blocks: string[] = [];

  for (const id of ids) {
    const expectedPath = path.join(rootDir, assetType, `${id}.md`);

    let content: string;
    try {
      content = await readFile(expectedPath, "utf8");
    } catch {
      throw new Error(`Missing asset file: ${path.normalize(expectedPath)}`);
    }

    blocks.push(`# ${id}\n${content.trimEnd()}`);
  }

  return `--- ${assetType.toUpperCase()} ---\n${blocks.join("\n---\n")}\n---\n`;
}

export async function loadAssets(rootDir: string, assets: ProjectAssetsConfig): Promise<LoadedAssets> {
  const instructionsSection = await loadAssetSection(rootDir, "instructions", assets.instructions);
  const skillsSection = await loadAssetSection(rootDir, "skills", assets.skills);
  const knowledgeSection = await loadAssetSection(rootDir, "knowledge", assets.knowledge);

  const composedSections = [instructionsSection, skillsSection, knowledgeSection].filter(
    (section): section is string => typeof section === "string" && section.length > 0,
  );

  return {
    instructionsSection,
    skillsSection,
    knowledgeSection,
    composed: composedSections.length > 0 ? composedSections.join("\n") : undefined,
  };
}
