import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildMetadataHeader } from "./buildMetadataHeader";
import type { SyncTarget } from "./discoverSyncTargets";

export interface ApplySyncChangesInput {
  rootDir: string;
  projectName: string;
  syncedAt: string;
  targets: SyncTarget[];
}

export interface ApplySyncChangesResult {
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
}

function buildSyncedFileContent(input: {
  rootDir: string;
  projectName: string;
  syncedAt: string;
  target: SyncTarget;
}): string {
  const header = buildMetadataHeader({
    rootDir: input.rootDir,
    assetId: input.target.assetId,
    assetType: input.target.assetType,
    syncedAt: input.syncedAt,
    project: input.projectName,
  });

  return `${header}\n${input.target.sourceContent}`;
}

/**
 * Applies confirmed sync changes.
 * - CREATE writes new file with metadata header + source content.
 * - UPDATE overwrites existing file with metadata header + source content.
 * - UNCHANGED is skipped.
 * - Failures are reported but do not stop remaining writes.
 */
export async function applySyncChanges(
  input: ApplySyncChangesInput,
  print: (line: string) => void = console.log,
): Promise<ApplySyncChangesResult> {
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const target of input.targets) {
    if (target.status === "UNCHANGED") {
      unchanged += 1;
      continue;
    }

    const content = buildSyncedFileContent({
      rootDir: input.rootDir,
      projectName: input.projectName,
      syncedAt: input.syncedAt,
      target,
    });

    try {
      await mkdir(path.dirname(target.targetPath), { recursive: true });
      await writeFile(target.targetPath, content, "utf8");

      if (target.status === "CREATE") {
        created += 1;
        print(`CREATED ${target.targetPath}`);
      } else {
        updated += 1;
        print(`UPDATED ${target.targetPath}`);
      }
    } catch (error: unknown) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      print(`ERROR ${target.targetPath}: ${message}`);
    }
  }

  return {
    created,
    updated,
    unchanged,
    failed,
  };
}
