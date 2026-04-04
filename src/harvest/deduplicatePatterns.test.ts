import test from "node:test";
import assert from "node:assert/strict";
import {
  deduplicatePattern,
  extractPatternTitle,
  normalizePatternTitle,
} from "./deduplicatePatterns";

test("two patterns with same normalized title discard the second", () => {
  const seen = new Set<string>();
  const first = [
    "# Pattern Summary",
    "",
    "## Title",
    "Retry Backoff",
  ].join("\n");
  const second = [
    "# Pattern Summary",
    "",
    "## Title",
    "retry backoff!!!",
  ].join("\n");

  assert.deepEqual(deduplicatePattern(first, seen), {
    keep: true,
    normalizedTitle: "retry backoff",
  });
  assert.deepEqual(deduplicatePattern(second, seen), {
    keep: false,
    normalizedTitle: "retry backoff",
  });
});

test("two patterns with different normalized titles are both kept", () => {
  const seen = new Set<string>();

  assert.equal(
    deduplicatePattern("# Pattern Summary\n\n## Title\nRetry Backoff", seen).keep,
    true,
  );
  assert.equal(
    deduplicatePattern("# Pattern Summary\n\n## Title\nJWT Validation", seen).keep,
    true,
  );
});

test("normalization strips punctuation and collapses spaces", () => {
  assert.equal(
    normalizePatternTitle("  Retry,   Backoff!!! Strategy  "),
    "retry backoff strategy",
  );
});

test("extractPatternTitle reads the title heading content", () => {
  const content = "# Pattern Summary\n\n## Title\nCorrelation Logging\n\n## Category\nlogging";
  assert.equal(extractPatternTitle(content), "Correlation Logging");
});