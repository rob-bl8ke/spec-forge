export function extractPatternTitle(content: string): string | undefined {
  const match = content.match(/^##\s+Title\s*\r?\n(.+)$/im);
  return match?.[1]?.trim();
}

export function normalizePatternTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DeduplicatePatternsResult {
  keep: boolean;
  normalizedTitle?: string;
}

/**
 * Session-scoped deduplication using exact normalized title matches.
 */
export function deduplicatePattern(
  content: string,
  seenTitles: Set<string>,
): DeduplicatePatternsResult {
  const title = extractPatternTitle(content);
  if (!title) {
    return { keep: true };
  }

  const normalizedTitle = normalizePatternTitle(title);
  if (normalizedTitle.length === 0) {
    return { keep: true };
  }

  if (seenTitles.has(normalizedTitle)) {
    return {
      keep: false,
      normalizedTitle,
    };
  }

  seenTitles.add(normalizedTitle);
  return {
    keep: true,
    normalizedTitle,
  };
}