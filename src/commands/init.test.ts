import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { initializeProjectConfig, scaffoldWorkspace } from "./init";

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

test("init creates the --repo directory if it does not exist", async () => {
  await withTempDir(async (tempDir) => {
    const projectPath = await initializeProjectConfig({
      rootDir: tempDir,
      projectName: "comm-service",
      repoPathInput: "./new-repo",
      cwd: tempDir,
    });

    const content = await readFile(projectPath, "utf8");
    assert.match(content, /name: comm-service/);

    const { access: fsAccess } = await import("node:fs/promises");
    await assert.doesNotReject(() => fsAccess(path.join(tempDir, "new-repo")));
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

test("scaffoldWorkspace creates a valid config.yaml in the given directory", async () => {
  await withTempDir(async (tempDir) => {
    await scaffoldWorkspace(tempDir);

    const content = await readFile(path.join(tempDir, "config.yaml"), "utf8");
    assert.match(content, /provider:/);
    assert.match(content, /active: copilot/);
    assert.match(content, /timeoutMs: 120000/);
    assert.match(content, /logging:/);
    assert.match(content, /level: info/);
    assert.match(content, /writePromptFiles: true/);
  });
});

test("scaffoldWorkspace creates the full workspace directory structure", async () => {
  await withTempDir(async (tempDir) => {
    await scaffoldWorkspace(tempDir);

    const { access: fsAccess } = await import("node:fs/promises");
    const expectedDirs = [
      "prompts", "workflows", "skills", "instructions", "knowledge",
      "projects", "output", ".logs",
      path.join("harvested", "patterns"),
      path.join("harvested", "candidate-skills"),
      path.join("harvested", "reports"),
    ];
    for (const dir of expectedDirs) {
      await assert.doesNotReject(
        () => fsAccess(path.join(tempDir, dir)),
        `Expected directory to exist: ${dir}`
      );
    }
  });
});

test("scaffoldWorkspace creates a default spec-to-tasks workflow", async () => {
  await withTempDir(async (tempDir) => {
    await scaffoldWorkspace(tempDir);

    const workflowPath = path.join(tempDir, "workflows", "spec-to-tasks.yaml");
    const content = await readFile(workflowPath, "utf8");
    assert.match(content, /id: spec-to-tasks/);
    assert.match(content, /id: requirements/);
    assert.match(content, /id: architecture/);
    assert.match(content, /id: jira-task/);
    assert.match(content, /id: task-prompt/);
  });
});

test("init works in a fresh directory with no existing config.yaml", async () => {
  await withTempDir(async (tempDir) => {
    await scaffoldWorkspace(tempDir);

    const projectPath = await initializeProjectConfig({
      rootDir: tempDir,
      projectName: "new-service",
      repoPathInput: "./my-repo",
      cwd: tempDir,
    });

    const content = await readFile(projectPath, "utf8");
    assert.match(content, /name: new-service/);
    assert.match(content, /repoPath: \.\/my-repo/);
  });
});
