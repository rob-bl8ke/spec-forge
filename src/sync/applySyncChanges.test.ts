import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { applySyncChanges } from "./applySyncChanges";
import type { SyncTarget } from "./discoverSyncTargets";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-sync-apply-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function makeTarget(overrides: Partial<SyncTarget>): SyncTarget {
  return {
    assetId: "kafka-patterns",
    assetType: "skills",
    sourcePath: "/source/skills/kafka-patterns.md",
    targetPath: "/target/skills/kafka-patterns.md",
    sourceContent: "# Kafka\nPatterns",
    status: "CREATE",
    ...overrides,
  };
}

test("CREATE writes header + content and creates missing directories", async () => {
  await withTempDir(async (tempDir) => {
    const targetPath = path.join(tempDir, "repo", ".github", "spec-forge", "skills", "kafka-patterns.md");
    const targets: SyncTarget[] = [
      makeTarget({
        targetPath,
        status: "CREATE",
        sourceContent: "# Kafka\nPatterns",
      }),
    ];

    const lines: string[] = [];
    const result = await applySyncChanges(
      {
        rootDir: tempDir,
        projectName: "comm-service",
        syncedAt: "2026-04-04T00:00:00Z",
        targets,
      },
      (line) => lines.push(line),
    );

    const content = await readFile(targetPath, "utf8");
    assert.ok(content.startsWith("<!-- SPEC-FORGE-SYNC"));
    assert.ok(content.includes("project: comm-service"));
    assert.ok(content.includes("# Kafka\nPatterns"));
    assert.equal(result.created, 1);
    assert.equal(result.failed, 0);
    assert.ok(lines.some((line) => line.startsWith("CREATED ")));
  });
});

test("UPDATE overwrites existing target file", async () => {
  await withTempDir(async (tempDir) => {
    const targetPath = path.join(tempDir, "repo", ".github", "spec-forge", "skills", "kafka-patterns.md");
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, "OLD CONTENT", "utf8");

    const targets: SyncTarget[] = [
      makeTarget({
        targetPath,
        status: "UPDATE",
        sourceContent: "# New\nBody",
      }),
    ];

    const result = await applySyncChanges({
      rootDir: tempDir,
      projectName: "comm-service",
      syncedAt: "2026-04-04T00:00:00Z",
      targets,
    });

    const content = await readFile(targetPath, "utf8");
    assert.ok(content.includes("# New\nBody"));
    assert.ok(!content.includes("OLD CONTENT"));
    assert.equal(result.updated, 1);
    assert.equal(result.failed, 0);
  });
});

test("UNCHANGED targets are skipped", async () => {
  await withTempDir(async (tempDir) => {
    const targetPath = path.join(tempDir, "repo", ".github", "spec-forge", "skills", "kafka-patterns.md");

    const targets: SyncTarget[] = [
      makeTarget({
        targetPath,
        status: "UNCHANGED",
      }),
    ];

    const lines: string[] = [];
    const result = await applySyncChanges(
      {
        rootDir: tempDir,
        projectName: "comm-service",
        syncedAt: "2026-04-04T00:00:00Z",
        targets,
      },
      (line) => lines.push(line),
    );

    assert.equal(result.unchanged, 1);
    assert.equal(result.created, 0);
    assert.equal(result.updated, 0);
    assert.equal(result.failed, 0);
    assert.equal(lines.length, 0);
  });
});

test("continues after a write failure and attempts remaining files", async () => {
  await withTempDir(async (tempDir) => {
    const blockedDir = path.join(tempDir, "blocked");
    // Create a file where a directory is expected, forcing mkdir/write failure.
    await writeFile(blockedDir, "not-a-directory", "utf8");

    const badTargetPath = path.join(blockedDir, "skills", "bad.md");
    const goodTargetPath = path.join(tempDir, "repo", ".github", "spec-forge", "skills", "good.md");

    const targets: SyncTarget[] = [
      makeTarget({ assetId: "bad", targetPath: badTargetPath, status: "CREATE", sourceContent: "bad" }),
      makeTarget({ assetId: "good", targetPath: goodTargetPath, status: "CREATE", sourceContent: "good" }),
    ];

    const lines: string[] = [];
    const result = await applySyncChanges(
      {
        rootDir: tempDir,
        projectName: "comm-service",
        syncedAt: "2026-04-04T00:00:00Z",
        targets,
      },
      (line) => lines.push(line),
    );

    const goodContent = await readFile(goodTargetPath, "utf8");
    assert.ok(goodContent.includes("good"));
    assert.equal(result.created, 1);
    assert.equal(result.failed, 1);
    assert.ok(lines.some((line) => line.startsWith("ERROR ")));
    assert.ok(lines.some((line) => line.startsWith("CREATED ")));
  });
});
