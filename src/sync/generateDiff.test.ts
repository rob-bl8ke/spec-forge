import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeLineDiff,
  formatLineDiff,
  printDiffForTarget,
} from "./generateDiff";

describe("computeLineDiff", () => {
  test("identical content → no hunks, hasChanges false", () => {
    const content = "line one\nline two\nline three";
    const diff = computeLineDiff(content, content);
    assert.equal(diff.hasChanges, false);
    assert.equal(diff.patch, "");
  });

  test("added line appears with + prefix in patch", () => {
    const old = "line one\nline two";
    const next = "line one\nline inserted\nline two";
    const diff = computeLineDiff(old, next);
    assert.equal(diff.hasChanges, true);
    assert.ok(diff.patch.includes("+line inserted"));
  });

  test("removed line appears with - prefix in patch", () => {
    const old = "line one\nline two\nline three";
    const next = "line one\nline three";
    const diff = computeLineDiff(old, next);
    assert.equal(diff.hasChanges, true);
    assert.ok(diff.patch.includes("-line two"));
  });

  test("changed line produces delete and insert lines", () => {
    const old = "line one\nold content\nline three";
    const next = "line one\nnew content\nline three";
    const diff = computeLineDiff(old, next);
    assert.equal(diff.hasChanges, true);
    assert.ok(diff.patch.includes("-old content"));
    assert.ok(diff.patch.includes("+new content"));
  });

  test("unchanged lines appear with space prefix in context", () => {
    const old = "context before\nold line\ncontext after";
    const next = "context before\nnew line\ncontext after";
    const diff = computeLineDiff(old, next);
    assert.ok(diff.patch.includes(" context before"));
    assert.ok(diff.patch.includes(" context after"));
  });

  test("completely replaced content includes delete and insert sections", () => {
    const old = "old line one\nold line two";
    const next = "new line one\nnew line two";
    const diff = computeLineDiff(old, next);
    assert.equal(diff.hasChanges, true);
    assert.ok(diff.patch.includes("-old line one"));
    assert.ok(diff.patch.includes("+new line one"));
  });

  test("patch includes standard unified header lines", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
    const old = lines.join("\n");
    const next = [...lines];
    next[10] = "changed line 11";
    const diff = computeLineDiff(old, next.join("\n"));
    assert.equal(diff.hasChanges, true);
    assert.ok(diff.patch.includes("--- target"));
    assert.ok(diff.patch.includes("+++ incoming"));
    assert.ok(diff.patch.includes("@@"));
  });
});

describe("formatLineDiff", () => {
  test("added line appears with + prefix", () => {
    const old = "line one\nline two";
    const next = "line one\nline added\nline two";
    const diff = computeLineDiff(old, next);
    const output = formatLineDiff(diff);
    assert.ok(output.includes("+line added"), `missing "+line added" in:\n${output}`);
  });

  test("removed line appears with - prefix", () => {
    const old = "line one\nline removed\nline two";
    const next = "line one\nline two";
    const diff = computeLineDiff(old, next);
    const output = formatLineDiff(diff);
    assert.ok(output.includes("-line removed"), `missing "-line removed" in:\n${output}`);
  });

  test("unchanged context lines appear with space prefix", () => {
    const old = "context\nold\ncontext";
    const next = "context\nnew\ncontext";
    const diff = computeLineDiff(old, next);
    const output = formatLineDiff(diff);
    assert.ok(output.includes(" context"), `missing context line in:\n${output}`);
  });

  test("output starts with --- and +++ headers", () => {
    const diff = computeLineDiff("old", "new", "target.md", "incoming");
    const output = formatLineDiff(diff);
    assert.ok(output.includes("--- target.md"), `bad header in:\n${output}`);
    assert.ok(output.includes("+++ incoming"), `missing +++ in:\n${output}`);
  });

  test("hunk header uses @@ format", () => {
    const diff = computeLineDiff("old", "new");
    const output = formatLineDiff(diff);
    assert.ok(output.includes("@@"), `missing @@ in:\n${output}`);
  });

  test("returns empty string when no changes", () => {
    const content = "same content";
    const diff = computeLineDiff(content, content);
    assert.equal(formatLineDiff(diff), "");
  });
});

describe("printDiffForTarget", () => {
  test("prints nothing for identical content", () => {
    const lines: string[] = [];
    printDiffForTarget("target.md", "same", "same", (l) => lines.push(l));
    assert.equal(lines.length, 0);
  });

  test("prints header line with target path for changed content", () => {
    const lines: string[] = [];
    printDiffForTarget(
      ".github/spec-forge/skills/kafka.md",
      "old content",
      "new content",
      (l) => lines.push(l),
    );
    assert.ok(lines.some((l) => l.includes(".github/spec-forge/skills/kafka.md")));
  });

  test("prints + line for added content", () => {
    const lines: string[] = [];
    printDiffForTarget("t.md", "line one", "line one\nline added", (l) => lines.push(l));
    assert.ok(lines.some((l) => l === "+line added"));
  });

  test("prints - line for removed content", () => {
    const lines: string[] = [];
    printDiffForTarget("t.md", "line one\nremoved line", "line one", (l) => lines.push(l));
    assert.ok(lines.some((l) => l === "-removed line"));
  });
});
