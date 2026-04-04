import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { determineNextVersion, persistOutput } from "./persistOutput";
import type { ConfirmService } from "../utils/confirm";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-persist-output-test-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function createMockConfirmer(answer: boolean): ConfirmService {
  return {
    async showUnifiedDiff(): Promise<void> {
      // no-op for tests
    },
    async confirmYesNo(): Promise<boolean> {
      return answer;
    },
  };
}

test("next version increments from v2 to v3", async () => {
  await withTempDir(async (tempDir) => {
    const featureRoot = path.join(tempDir, "output", "comm-service", "campaign-retry");
    await mkdir(path.join(featureRoot, "v1"), { recursive: true });
    await mkdir(path.join(featureRoot, "v2"), { recursive: true });

    const next = await determineNextVersion(tempDir, "comm-service", "campaign-retry");
    assert.equal(next, "v3");
  });
});

test("full run creates next version and writes canonical artifact", async () => {
  await withTempDir(async (tempDir) => {
    const result = await persistOutput(
      {
        mode: "full-run",
        rootDir: tempDir,
        project: "comm-service",
        feature: "campaign-retry",
        stepId: "requirements",
        content: "# Requirements\n...",
      },
      createMockConfirmer(true),
    );

    assert.equal(result.version, "v1");
    const written = await readFile(result.artifactPath, "utf8");
    assert.equal(written, "# Requirements\n...");
  });
});

test("step rerun writes to existing version folder and not a new version", async () => {
  await withTempDir(async (tempDir) => {
    const versionDir = path.join(tempDir, "output", "comm-service", "campaign-retry", "v2");
    await mkdir(versionDir, { recursive: true });
    await writeFile(path.join(versionDir, "architecture.md"), "old", "utf8");

    const result = await persistOutput(
      {
        mode: "step-rerun",
        rootDir: tempDir,
        project: "comm-service",
        feature: "campaign-retry",
        version: "v2",
        stepId: "architecture",
        content: "new",
      },
      createMockConfirmer(true),
    );

    assert.equal(result.version, "v2");
    const canonical = await readFile(path.join(versionDir, "architecture.md"), "utf8");
    assert.equal(canonical, "new");
  });
});

test("rerunning requirements fails with named error", async () => {
  await withTempDir(async (tempDir) => {
    const versionDir = path.join(tempDir, "output", "comm-service", "campaign-retry", "v1");
    await mkdir(versionDir, { recursive: true });

    await assert.rejects(
      async () =>
        persistOutput(
          {
            mode: "step-rerun",
            rootDir: tempDir,
            project: "comm-service",
            feature: "campaign-retry",
            version: "v1",
            stepId: "requirements",
            content: "new",
          },
          createMockConfirmer(true),
        ),
      /requirements cannot be rerun/i,
    );
  });
});

test("declining replacement preserves .new.md and keeps canonical unchanged", async () => {
  await withTempDir(async (tempDir) => {
    const versionDir = path.join(tempDir, "output", "comm-service", "campaign-retry", "v1");
    await mkdir(versionDir, { recursive: true });
    await writeFile(path.join(versionDir, "architecture.md"), "old", "utf8");

    const result = await persistOutput(
      {
        mode: "step-rerun",
        rootDir: tempDir,
        project: "comm-service",
        feature: "campaign-retry",
        version: "v1",
        stepId: "architecture",
        content: "new",
      },
      createMockConfirmer(false),
    );

    const canonical = await readFile(path.join(versionDir, "architecture.md"), "utf8");
    assert.equal(canonical, "old");
    assert.equal(result.replacedCanonical, false);
    assert.ok(result.newArtifactPath?.endsWith("architecture.new.md"));

    const newContent = await readFile(path.join(versionDir, "architecture.new.md"), "utf8");
    assert.equal(newContent, "new");
  });
});
