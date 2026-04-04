import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { printSyncPreview } from "./printSyncPreview";
import type { SyncTarget } from "./discoverSyncTargets";

function makeTarget(
  assetId: string,
  assetType: "skills" | "instructions" | "knowledge",
  status: "CREATE" | "UPDATE" | "UNCHANGED",
): SyncTarget {
  return {
    assetId,
    assetType,
    sourcePath: `/spec-forge/${assetType}/${assetId}.md`,
    targetPath: `.github/spec-forge/${assetType}/${assetId}.md`,
    sourceContent: "content",
    status,
  };
}

describe("printSyncPreview", () => {
  test("prints one line per target with status label and target path", () => {
    const targets: SyncTarget[] = [
      makeTarget("kafka-patterns", "skills", "CREATE"),
      makeTarget("backend-baseline", "instructions", "UPDATE"),
      makeTarget("event-driven", "knowledge", "UNCHANGED"),
    ];

    const lines: string[] = [];
    printSyncPreview(targets, (line) => lines.push(line));

    assert.ok(lines[0].includes("CREATE"));
    assert.ok(lines[0].includes(".github/spec-forge/skills/kafka-patterns.md"));

    assert.ok(lines[1].includes("UPDATE"));
    assert.ok(lines[1].includes(".github/spec-forge/instructions/backend-baseline.md"));

    assert.ok(lines[2].includes("UNCHANGED"));
    assert.ok(lines[2].includes(".github/spec-forge/knowledge/event-driven.md"));
  });

  test("summary line is printed as the last line", () => {
    const targets: SyncTarget[] = [
      makeTarget("a", "skills", "CREATE"),
      makeTarget("b", "instructions", "UPDATE"),
      makeTarget("c", "knowledge", "UNCHANGED"),
    ];

    const lines: string[] = [];
    printSyncPreview(targets, (line) => lines.push(line));

    const summary = lines[lines.length - 1];
    assert.ok(summary.includes("1 to create"), `expected "1 to create" in: ${summary}`);
    assert.ok(summary.includes("1 to update"), `expected "1 to update" in: ${summary}`);
    assert.ok(summary.includes("1 unchanged"), `expected "1 unchanged" in: ${summary}`);
  });

  test("requiresConfirmation is true when CREATE entries are present", () => {
    const targets: SyncTarget[] = [makeTarget("a", "skills", "CREATE")];
    const result = printSyncPreview(targets, () => {});
    assert.equal(result.requiresConfirmation, true);
  });

  test("requiresConfirmation is true when UPDATE entries are present", () => {
    const targets: SyncTarget[] = [makeTarget("a", "skills", "UPDATE")];
    const result = printSyncPreview(targets, () => {});
    assert.equal(result.requiresConfirmation, true);
  });

  test("requiresConfirmation is false when all assets are UNCHANGED", () => {
    const targets: SyncTarget[] = [
      makeTarget("a", "skills", "UNCHANGED"),
      makeTarget("b", "instructions", "UNCHANGED"),
    ];
    const result = printSyncPreview(targets, () => {});
    assert.equal(result.requiresConfirmation, false);
  });

  test("returns correct counts for mixed status list", () => {
    const targets: SyncTarget[] = [
      makeTarget("a", "skills", "CREATE"),
      makeTarget("b", "skills", "CREATE"),
      makeTarget("c", "instructions", "UPDATE"),
      makeTarget("d", "knowledge", "UNCHANGED"),
      makeTarget("e", "knowledge", "UNCHANGED"),
      makeTarget("f", "knowledge", "UNCHANGED"),
    ];

    const result = printSyncPreview(targets, () => {});
    assert.equal(result.toCreate, 2);
    assert.equal(result.toUpdate, 1);
    assert.equal(result.unchanged, 3);
  });

  test("all-UNCHANGED list prints preview but requiresConfirmation is false", () => {
    const targets: SyncTarget[] = [
      makeTarget("a", "skills", "UNCHANGED"),
      makeTarget("b", "instructions", "UNCHANGED"),
      makeTarget("c", "knowledge", "UNCHANGED"),
    ];

    const lines: string[] = [];
    const result = printSyncPreview(targets, (line) => lines.push(line));

    // Preview lines are still printed (3 assets + 1 summary)
    assert.equal(lines.length, 4);
    assert.equal(result.requiresConfirmation, false);
    assert.ok(lines[lines.length - 1].includes("3 unchanged"));
  });

  test("summary omits zero-count sections", () => {
    const targets: SyncTarget[] = [makeTarget("a", "skills", "CREATE")];

    const lines: string[] = [];
    printSyncPreview(targets, (line) => lines.push(line));

    const summary = lines[lines.length - 1];
    assert.ok(summary.includes("1 to create"));
    assert.ok(!summary.includes("to update"), `unexpected "to update" in: ${summary}`);
    assert.ok(!summary.includes("unchanged"), `unexpected "unchanged" in: ${summary}`);
  });

  test("output format matches spec §11.4 example structure", () => {
    const targets: SyncTarget[] = [
      makeTarget("kafka-patterns", "skills", "CREATE"),
      makeTarget("backend-service-baseline", "instructions", "UPDATE"),
      makeTarget("event-driven-guidelines", "knowledge", "UNCHANGED"),
    ];

    const lines: string[] = [];
    printSyncPreview(targets, (line) => lines.push(line));

    // Labels should be padded to fixed width (UNCHANGED is widest at 9 chars)
    assert.ok(lines[0].startsWith("CREATE   "), `bad format: ${lines[0]}`);
    assert.ok(lines[1].startsWith("UPDATE   "), `bad format: ${lines[1]}`);
    assert.ok(lines[2].startsWith("UNCHANGED"), `bad format: ${lines[2]}`);
  });
});
