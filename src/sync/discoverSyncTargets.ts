import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AssetType } from "./buildMetadataHeader";

export type SyncStatus = "CREATE" | "UPDATE" | "UNCHANGED";

export interface SyncTarget {
  assetId: string;
  assetType: AssetType;
  sourcePath: string;
  targetPath: string;
  sourceContent: string;
  status: SyncStatus;
}

export interface DiscoverSyncTargetsInput {
  rootDir: string;
  repoPath: string;
  targetDir: string;
  targets?: {
    skills?: string;
    instructions?: string;
    knowledge?: string;
  };
  assets: {
    skills?: string[];
    instructions?: string[];
    knowledge?: string[];
  };
}

/**
 * Resolves the target path for a synced asset under the repo.
 * Target path: <repoPath>/<targetDir>/<type>/<id>.md
 * Default targetDir uses spec §11.1: .github/spec-forge
 */
export function resolveTargetPath(
  repoPath: string,
  targetDir: string,
  assetType: AssetType,
  assetId: string,
): string {
  return path.join(repoPath, targetDir, assetType, `${assetId}.md`);
}

/**
 * Resolves the source path for an asset from the spec-forge root.
 * Source path: <rootDir>/<type>/<id>.md
 */
export function resolveSourcePath(
  rootDir: string,
  assetType: AssetType,
  assetId: string,
): string {
  return path.join(rootDir, assetType, `${assetId}.md`);
}

/**
 * Classifies a single asset for sync:
 * - Missing target → CREATE
 * - Target matches source → UNCHANGED
 * - Target differs from source → UPDATE
 *
 * Comparison strips leading metadata headers from the target before comparing
 * to the source content (so re-syncing doesn't always show UPDATE).
 */
export function classifySyncStatus(
  sourceContent: string,
  targetContent: string | undefined,
): SyncStatus {
  if (targetContent === undefined) {
    return "CREATE";
  }

  // Strip the metadata header from the target before comparing
  const targetWithoutHeader = stripMetadataHeader(targetContent);

  if (targetWithoutHeader.trim() === sourceContent.trim()) {
    return "UNCHANGED";
  }

  return "UPDATE";
}

/**
 * Strips the <!-- SPEC-FORGE-SYNC ... --> header from a file's content.
 * Returns the remainder of the file.
 */
export function stripMetadataHeader(content: string): string {
  const headerPattern = /^<!--\s*SPEC-FORGE-SYNC[\s\S]*?-->\n?/;
  return content.replace(headerPattern, "");
}

/**
 * Discovers all sync targets for a project's configured assets.
 * For each asset, resolves source/target paths, reads both files,
 * and classifies the sync status.
 */
export async function discoverSyncTargets(
  input: DiscoverSyncTargetsInput,
): Promise<SyncTarget[]> {
  const results: SyncTarget[] = [];

  const assetTypes: AssetType[] = ["skills", "instructions", "knowledge"];

  for (const assetType of assetTypes) {
    const ids = input.assets[assetType] ?? [];

    for (const assetId of ids) {
      const sourcePath = resolveSourcePath(input.rootDir, assetType, assetId);
      const effectiveTargetDir = input.targets?.[assetType] ?? input.targetDir;
      const targetPath = resolveTargetPath(
        input.repoPath,
        effectiveTargetDir,
        assetType,
        assetId,
      );

      // Read source (required — throw if missing)
      let sourceContent: string;
      try {
        sourceContent = await readFile(sourcePath, "utf8");
      } catch {
        throw new Error(`Missing source asset file: ${path.normalize(sourcePath)}`);
      }

      // Read target (optional — missing means CREATE)
      let targetContent: string | undefined;
      try {
        targetContent = await readFile(targetPath, "utf8");
      } catch {
        targetContent = undefined;
      }

      const status = classifySyncStatus(sourceContent, targetContent);

      results.push({
        assetId,
        assetType,
        sourcePath,
        targetPath,
        sourceContent,
        status,
      });
    }
  }

  return results;
}
