import type { SyncTarget, SyncStatus } from "./discoverSyncTargets";

export interface SyncPreviewResult {
  requiresConfirmation: boolean;
  toCreate: number;
  toUpdate: number;
  unchanged: number;
}

const LABEL_WIDTH = 9; // "UNCHANGED" is 9 chars — widest label

function formatLabel(status: SyncStatus): string {
  return status.padEnd(LABEL_WIDTH);
}

function formatLine(target: SyncTarget): string {
  return `${formatLabel(target.status)}${target.targetPath}`;
}

function buildSummaryLine(toCreate: number, toUpdate: number, unchanged: number): string {
  const parts: string[] = [];

  if (toCreate > 0) {
    parts.push(`${toCreate} to create`);
  }
  if (toUpdate > 0) {
    parts.push(`${toUpdate} to update`);
  }
  if (unchanged > 0) {
    parts.push(`${unchanged} unchanged`);
  }

  return parts.join(", ");
}

/**
 * Prints the sync preview per spec-v1.md §11.4.
 * One line per asset with status label + target path, followed by a summary.
 * Returns whether a confirmation step is required (any CREATE or UPDATE present).
 */
export function printSyncPreview(
  targets: SyncTarget[],
  print: (line: string) => void = console.log,
): SyncPreviewResult {
  let toCreate = 0;
  let toUpdate = 0;
  let unchanged = 0;

  for (const target of targets) {
    print(formatLine(target));

    if (target.status === "CREATE") toCreate++;
    else if (target.status === "UPDATE") toUpdate++;
    else unchanged++;
  }

  print(buildSummaryLine(toCreate, toUpdate, unchanged));

  return {
    requiresConfirmation: toCreate > 0 || toUpdate > 0,
    toCreate,
    toUpdate,
    unchanged,
  };
}
