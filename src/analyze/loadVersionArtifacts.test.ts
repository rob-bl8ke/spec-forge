import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import {
  CANONICAL_ARTIFACTS,
  buildVersionOutputDir,
  loadVersionArtifacts,
} from "./loadVersionArtifacts";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-analyze-load-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function seedVersionDir(
  rootDir: string,
  project: string,
  feature: string,
  version: string,
  suffix: string,
): Promise<string> {
  const versionDir = buildVersionOutputDir(rootDir, project, feature, version);
  await mkdir(versionDir, { recursive: true });

  for (const fileName of CANONICAL_ARTIFACTS) {
    await writeFile(path.join(versionDir, fileName), `${fileName} ${suffix}\n`, "utf8");
  }

  return versionDir;
}

test("both versions fully present returns all four artifact pairs", async () => {
  await withTempDir(async (tempDir) => {
    const project = "comm-service";
    const feature = "Campaign Retry";

    const fromDir = await seedVersionDir(tempDir, project, feature, "v1", "from");
    const toDir = await seedVersionDir(tempDir, project, feature, "v2", "to");

    const result = await loadVersionArtifacts({
      rootDir: tempDir,
      project,
      feature,
      fromVersion: "v1",
      toVersion: "v2",
    });

    assert.equal(result.fromDir, fromDir);
    assert.equal(result.toDir, toDir);
    assert.equal(result.pairs.length, 4);
    assert.deepEqual(result.pairs.map((pair) => pair.fileName), [...CANONICAL_ARTIFACTS]);

    const requirementsPair = result.pairs.find((pair) => pair.fileName === "requirements.md");
    assert.ok(requirementsPair);
    assert.match(requirementsPair.fromContent, /requirements\.md from/);
    assert.match(requirementsPair.toContent, /requirements\.md to/);
  });
});

test("missing from-version folder produces named error identifying version", async () => {
  await withTempDir(async (tempDir) => {
    const project = "comm-service";
    const feature = "Campaign Retry";
    await seedVersionDir(tempDir, project, feature, "v2", "to");

    await assert.rejects(
      () => loadVersionArtifacts({
        rootDir: tempDir,
        project,
        feature,
        fromVersion: "v1",
        toVersion: "v2",
      }),
      /Missing version folder 'v1':/,
    );
  });
});

test("missing canonical artifact in to-version produces named error", async () => {
  await withTempDir(async (tempDir) => {
    const project = "comm-service";
    const feature = "Campaign Retry";
    await seedVersionDir(tempDir, project, feature, "v1", "from");
    const toDir = await seedVersionDir(tempDir, project, feature, "v2", "to");

    await rm(path.join(toDir, "jira-task.md"));

    await assert.rejects(
      () => loadVersionArtifacts({
        rootDir: tempDir,
        project,
        feature,
        fromVersion: "v1",
        toVersion: "v2",
      }),
      /Missing canonical artifact 'jira-task\.md':/,
    );
  });
});

test("feature slug is applied before path construction", async () => {
  await withTempDir(async (tempDir) => {
    const project = "comm-service";
    const feature = "IMS / Retry Fix";

    await seedVersionDir(tempDir, project, feature, "v1", "from");
    await seedVersionDir(tempDir, project, feature, "v2", "to");

    const result = await loadVersionArtifacts({
      rootDir: tempDir,
      project,
      feature,
      fromVersion: "v1",
      toVersion: "v2",
    });

    assert.match(result.fromDir, /ims-retry-fix[\\/]v1$/);
    assert.match(result.toDir, /ims-retry-fix[\\/]v2$/);
  });
});