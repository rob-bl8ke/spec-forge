import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  discoverSyncTargets,
  resolveTargetPath,
  resolveSourcePath,
  classifySyncStatus,
  stripMetadataHeader,
} from "./discoverSyncTargets";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "spec-forge-sync-test-"));
  try {
    await fn(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

describe("resolveTargetPath", () => {
  test("produces correct path for each asset type", () => {
    const repoPath = "/repo";
    const targetDir = ".github/spec-forge";

    assert.equal(
      resolveTargetPath(repoPath, targetDir, "skills", "kafka-patterns"),
      path.join(repoPath, ".github/spec-forge", "skills", "kafka-patterns.md"),
    );
    assert.equal(
      resolveTargetPath(repoPath, targetDir, "instructions", "backend-baseline"),
      path.join(repoPath, ".github/spec-forge", "instructions", "backend-baseline.md"),
    );
    assert.equal(
      resolveTargetPath(repoPath, targetDir, "knowledge", "event-driven"),
      path.join(repoPath, ".github/spec-forge", "knowledge", "event-driven.md"),
    );
  });
});

describe("resolveSourcePath", () => {
  test("produces correct path under rootDir", () => {
    const rootDir = "/spec-forge";
    assert.equal(
      resolveSourcePath(rootDir, "skills", "spring-boot"),
      path.join(rootDir, "skills", "spring-boot.md"),
    );
  });
});

describe("classifySyncStatus", () => {
  test("missing target → CREATE", () => {
    assert.equal(classifySyncStatus("content", undefined), "CREATE");
  });

  test("identical content → UNCHANGED", () => {
    const content = "# My Skill\nSome content here.";
    assert.equal(classifySyncStatus(content, content), "UNCHANGED");
  });

  test("target with metadata header but same body → UNCHANGED", () => {
    const source = "# My Skill\nSome content here.";
    const targetWithHeader = `<!-- SPEC-FORGE-SYNC\nsource: spec-forge/skills/my-skill.md\nassetId: my-skill\nassetType: skill\nsyncedAt: 2026-01-01T00:00:00Z\nproject: my-project\n-->\n${source}`;
    assert.equal(classifySyncStatus(source, targetWithHeader), "UNCHANGED");
  });

  test("changed content → UPDATE", () => {
    const source = "# My Skill\nUpdated content.";
    const target = "# My Skill\nOld content.";
    assert.equal(classifySyncStatus(source, target), "UPDATE");
  });
});

describe("stripMetadataHeader", () => {
  test("removes SPEC-FORGE-SYNC header block", () => {
    const header = "<!-- SPEC-FORGE-SYNC\nsource: spec-forge/skills/test.md\nassetId: test\nassetType: skill\nsyncedAt: 2026-01-01T00:00:00Z\nproject: proj\n-->\n";
    const body = "# Test\nContent here.";
    assert.equal(stripMetadataHeader(header + body), body);
  });

  test("returns content unchanged when no header present", () => {
    const content = "# Test\nContent here.";
    assert.equal(stripMetadataHeader(content), content);
  });
});

describe("discoverSyncTargets", () => {
  test("missing target file → CREATE status", async () => {
    await withTempDir(async (tempDir) => {
      const rootDir = tempDir;
      const repoPath = path.join(tempDir, "repo");
      await mkdir(path.join(rootDir, "skills"), { recursive: true });
      await mkdir(repoPath, { recursive: true });

      await writeFile(
        path.join(rootDir, "skills", "kafka-patterns.md"),
        "# Kafka Patterns\nContent.",
        "utf8",
      );

      const targets = await discoverSyncTargets({
        rootDir,
        repoPath,
        targetDir: ".github/spec-forge",
        assets: { skills: ["kafka-patterns"] },
      });

      assert.equal(targets.length, 1);
      assert.equal(targets[0].status, "CREATE");
      assert.equal(targets[0].assetId, "kafka-patterns");
      assert.equal(targets[0].assetType, "skills");
    });
  });

  test("identical target content → UNCHANGED status", async () => {
    await withTempDir(async (tempDir) => {
      const rootDir = tempDir;
      const repoPath = path.join(tempDir, "repo");
      const targetDir = path.join(repoPath, ".github", "spec-forge", "skills");
      await mkdir(path.join(rootDir, "skills"), { recursive: true });
      await mkdir(targetDir, { recursive: true });

      const content = "# My Skill\nSome content.";
      await writeFile(path.join(rootDir, "skills", "my-skill.md"), content, "utf8");
      await writeFile(path.join(targetDir, "my-skill.md"), content, "utf8");

      const targets = await discoverSyncTargets({
        rootDir,
        repoPath,
        targetDir: ".github/spec-forge",
        assets: { skills: ["my-skill"] },
      });

      assert.equal(targets.length, 1);
      assert.equal(targets[0].status, "UNCHANGED");
    });
  });

  test("changed target content → UPDATE status", async () => {
    await withTempDir(async (tempDir) => {
      const rootDir = tempDir;
      const repoPath = path.join(tempDir, "repo");
      const targetDir = path.join(repoPath, ".github", "spec-forge", "skills");
      await mkdir(path.join(rootDir, "skills"), { recursive: true });
      await mkdir(targetDir, { recursive: true });

      await writeFile(
        path.join(rootDir, "skills", "my-skill.md"),
        "# My Skill\nNew content.",
        "utf8",
      );
      await writeFile(
        path.join(targetDir, "my-skill.md"),
        "# My Skill\nOld content.",
        "utf8",
      );

      const targets = await discoverSyncTargets({
        rootDir,
        repoPath,
        targetDir: ".github/spec-forge",
        assets: { skills: ["my-skill"] },
      });

      assert.equal(targets.length, 1);
      assert.equal(targets[0].status, "UPDATE");
    });
  });

  test("processes all three asset types", async () => {
    await withTempDir(async (tempDir) => {
      const rootDir = tempDir;
      const repoPath = path.join(tempDir, "repo");
      await mkdir(path.join(rootDir, "skills"), { recursive: true });
      await mkdir(path.join(rootDir, "instructions"), { recursive: true });
      await mkdir(path.join(rootDir, "knowledge"), { recursive: true });
      await mkdir(repoPath, { recursive: true });

      await writeFile(path.join(rootDir, "skills", "skill-a.md"), "skill content", "utf8");
      await writeFile(path.join(rootDir, "instructions", "inst-a.md"), "instruction content", "utf8");
      await writeFile(path.join(rootDir, "knowledge", "know-a.md"), "knowledge content", "utf8");

      const targets = await discoverSyncTargets({
        rootDir,
        repoPath,
        targetDir: ".github/spec-forge",
        assets: {
          skills: ["skill-a"],
          instructions: ["inst-a"],
          knowledge: ["know-a"],
        },
      });

      assert.equal(targets.length, 3);
      const types = targets.map((t) => t.assetType).sort();
      assert.deepEqual(types, ["instructions", "knowledge", "skills"]);
      assert.ok(targets.every((t) => t.status === "CREATE"));
    });
  });

  test("throws when source asset file is missing", async () => {
    await withTempDir(async (tempDir) => {
      const rootDir = tempDir;
      const repoPath = path.join(tempDir, "repo");
      await mkdir(path.join(rootDir, "skills"), { recursive: true });
      await mkdir(repoPath, { recursive: true });

      await assert.rejects(
        () =>
          discoverSyncTargets({
            rootDir,
            repoPath,
            targetDir: ".github/spec-forge",
            assets: { skills: ["missing-skill"] },
          }),
        /Missing source asset file/,
      );
    });
  });

  test("target path includes assetId and assetType in result", async () => {
    await withTempDir(async (tempDir) => {
      const rootDir = tempDir;
      const repoPath = path.join(tempDir, "repo");
      await mkdir(path.join(rootDir, "skills"), { recursive: true });
      await mkdir(repoPath, { recursive: true });

      await writeFile(path.join(rootDir, "skills", "spring-boot.md"), "content", "utf8");

      const targets = await discoverSyncTargets({
        rootDir,
        repoPath,
        targetDir: ".github/spec-forge",
        assets: { skills: ["spring-boot"] },
      });

      assert.equal(targets.length, 1);
      assert.equal(targets[0].assetId, "spring-boot");
      assert.equal(targets[0].assetType, "skills");
      assert.ok(targets[0].targetPath.includes("spring-boot.md"));
      assert.ok(targets[0].targetPath.includes("skills"));
    });
  });

  test("per-asset-type targets override targetDir for that type only", async () => {
    await withTempDir(async (tempDir) => {
      const rootDir = tempDir;
      const repoPath = path.join(tempDir, "repo");
      await mkdir(path.join(rootDir, "skills"), { recursive: true });
      await mkdir(path.join(rootDir, "instructions"), { recursive: true });
      await mkdir(repoPath, { recursive: true });

      await writeFile(path.join(rootDir, "skills", "my-skill.md"), "skill content", "utf8");
      await writeFile(path.join(rootDir, "instructions", "my-inst.md"), "inst content", "utf8");

      const targets = await discoverSyncTargets({
        rootDir,
        repoPath,
        targetDir: ".github/spec-forge",
        targets: { skills: ".github/skills" },
        assets: {
          skills: ["my-skill"],
          instructions: ["my-inst"],
        },
      });

      const skillTarget = targets.find((t) => t.assetType === "skills")!;
      const instTarget = targets.find((t) => t.assetType === "instructions")!;

      // skills uses the per-type override
      assert.ok(skillTarget.targetPath.includes(path.join(".github", "skills")));
      assert.ok(!skillTarget.targetPath.includes(path.join(".github", "spec-forge")));

      // instructions falls back to targetDir
      assert.ok(instTarget.targetPath.includes(path.join(".github", "spec-forge")));
    });
  });
});
