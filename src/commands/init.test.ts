import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { initializeProjectConfig } from "./init";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-init-test-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("init creates projects/<name>.yaml with canonical defaults", async () => {
  await withTempDir(async (tempDir) => {
    await writeFile(path.join(tempDir, "config.yaml"), "provider:\n  active: copilot\n  timeoutMs: 120000\nlogging:\n  level: info\n  writePromptFiles: true\n", "utf8");
    const repoDir = path.join(tempDir, "repo");
    await mkdir(repoDir, { recursive: true });

    const projectPath = await initializeProjectConfig({
      rootDir: tempDir,
      projectName: "comm-service",
      repoPathInput: "./repo",
      cwd: tempDir,
    });

    const content = await readFile(projectPath, "utf8");

    assert.match(content, /name: comm-service/);
    assert.match(content, /repoPath: \.\/repo/);
    assert.match(content, /provider: copilot/);
    assert.match(content, /defaultWorkflow: spec-to-tasks/);
    assert.match(content, /overwritePolicy: prompt/);
    assert.match(content, /includeExtensions:\n    - \.ts\n    - \.js/);
  });
});

test("init fails when --repo path does not exist", async () => {
  await withTempDir(async (tempDir) => {
    await assert.rejects(
      async () => initializeProjectConfig({
        rootDir: tempDir,
        projectName: "comm-service",
        repoPathInput: "./missing-repo",
        cwd: tempDir,
      }),
      /Invalid --repo path:/,
    );
  });
});

test("init fails and does not overwrite when project file already exists", async () => {
  await withTempDir(async (tempDir) => {
    const repoDir = path.join(tempDir, "repo");
    const projectsDir = path.join(tempDir, "projects");
    await mkdir(repoDir, { recursive: true });
    await mkdir(projectsDir, { recursive: true });

    const existingPath = path.join(projectsDir, "comm-service.yaml");
    await writeFile(existingPath, "name: comm-service\nrepoPath: ./repo\n", "utf8");

    await assert.rejects(
      async () => initializeProjectConfig({
        rootDir: tempDir,
        projectName: "comm-service",
        repoPathInput: "./repo",
        cwd: tempDir,
      }),
      /Project config already exists:/,
    );

    const content = await readFile(existingPath, "utf8");
    assert.equal(content, "name: comm-service\nrepoPath: ./repo\n");
  });
});
