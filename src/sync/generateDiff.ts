import { createTwoFilesPatch } from "diff";

export interface LineDiff {
  patch: string;
  hasChanges: boolean;
}

const CONTEXT_LINES = 3;

/**
 * Computes a unified line-level diff between oldContent (target) and newContent (source).
 */
export function computeLineDiff(
  oldContent: string,
  newContent: string,
  oldLabel = "target",
  newLabel = "incoming",
): LineDiff {
  if (oldContent === newContent) {
    return { patch: "", hasChanges: false };
  }

  const patch = createTwoFilesPatch(oldLabel, newLabel, oldContent, newContent, "", "", {
    context: CONTEXT_LINES,
    // Normalize CRLF/LF differences so terminal output is readable across platforms.
    stripTrailingCr: true,
  });

  // createPatch always emits headers; if content changed this is a real diff.
  return { patch, hasChanges: true };
}

/**
 * Formats a LineDiff as a unified diff string.
 */
export function formatLineDiff(diff: LineDiff): string {
  return diff.patch;
}

/**
 * Prints diffs for all UPDATE targets using the provided print function.
 * Returns without printing anything for CREATE or UNCHANGED targets.
 */
export function printDiffForTarget(
  targetPath: string,
  oldContent: string,
  newContent: string,
  print: (line: string) => void = console.log,
): void {
  const diff = computeLineDiff(oldContent, newContent, targetPath, "incoming");

  if (!diff.hasChanges) {
    return;
  }

  print(`\nDiff: ${targetPath}`);
  for (const line of formatLineDiff(diff).split(/\r?\n/)) {
    if (line.length > 0) {
      print(line);
    }
  }
}
