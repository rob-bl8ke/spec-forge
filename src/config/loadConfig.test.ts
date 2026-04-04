import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { findSpecForgeRoot, loadConfig } from "./loadConfig";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-config-test-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("findSpecForgeRoot locates config.yaml from a nested directory", async () => {
  await withTempDir(async (tempDir) => {
    await writeFile(
      path.join(tempDir, "config.yaml"),
      "provider:\n  active: copilot\n  timeoutMs: 120000\nlogging:\n  level: info\n  writePromptFiles: true\n",
      "utf8",
    );

    const nestedDir = path.join(tempDir, "a", "b", "c");
    await mkdir(nestedDir, { recursive: true });

    const root = await findSpecForgeRoot(nestedDir);
    assert.equal(root, tempDir);
  });
});

test("findSpecForgeRoot throws clear error when config.yaml is absent", async () => {
  await withTempDir(async (tempDir) => {
    await assert.rejects(
      async () => findSpecForgeRoot(tempDir),
      /Could not find config\.yaml by walking up from/,
    );
  });
});

test("loadConfig applies project provider override over global provider.active", async () => {
  await withTempDir(async (tempDir) => {
    await writeFile(
      path.join(tempDir, "config.yaml"),
      "provider:\n  active: copilot\n  timeoutMs: 120000\nlogging:\n  level: info\n  writePromptFiles: true\n",
      "utf8",
    );

    const projectsDir = path.join(tempDir, "projects");
    await mkdir(projectsDir, { recursive: true });

    await writeFile(
      path.join(projectsDir, "comm-service.yaml"),
      "name: comm-service\nprovider: claude\nrepoPath: ../repo\n",
      "utf8",
    );

    const context = await loadConfig({ cwd: tempDir, projectName: "comm-service" });

    assert.equal(context.globalConfig.provider.active, "copilot");
    assert.equal(context.projectConfig?.provider, "claude");
    assert.equal(context.resolvedProvider, "claude");
    assert.equal(context.resolvedProject?.provider, "claude");
  });
});
