import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { findSpecForgeRoot, loadConfig } from "./loadConfig";
import { validateGlobalConfig, validateProjectConfig } from "./validateConfig";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-config-test-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function writeGlobalConfig(tempDir: string, content: string): Promise<string> {
  const configPath = path.join(tempDir, "config.yaml");
  await writeFile(configPath, content, "utf8");
  return configPath;
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
    await writeGlobalConfig(
      tempDir,
      "provider:\n  active: copilot\n  timeoutMs: 120000\nlogging:\n  level: info\n  writePromptFiles: true\n",
    );

    const projectsDir = path.join(tempDir, "projects");
    await mkdir(projectsDir, { recursive: true });
    const repoDir = path.join(tempDir, "repo");
    await mkdir(repoDir, { recursive: true });

    await writeFile(
      path.join(projectsDir, "comm-service.yaml"),
      "name: comm-service\nprovider: claude\nrepoPath: ../repo\nsync:\n  overwritePolicy: prompt\n",
      "utf8",
    );

    const context = await loadConfig({ cwd: tempDir, projectName: "comm-service" });

    assert.equal(context.globalConfig.provider.active, "copilot");
    assert.equal(context.projectConfig?.provider, "claude");
    assert.equal(context.resolvedProvider, "claude");
    assert.equal(context.resolvedProject?.provider, "claude");
  });
});

test("global config missing provider.active fails with named error and file path", async () => {
  await withTempDir(async (tempDir) => {
    const configPath = await writeGlobalConfig(
      tempDir,
      "provider:\n  timeoutMs: 120000\nlogging:\n  level: info\n  writePromptFiles: true\n",
    );

    const raw = {
      provider: { timeoutMs: 120000 },
      logging: { level: "info", writePromptFiles: true },
    };

    assert.throws(
      () => validateGlobalConfig(raw, configPath),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return message.includes("provider.active") && message.includes(path.normalize(configPath));
      },
    );
  });
});

test("global config invalid provider.active value fails with named error", async () => {
  await withTempDir(async (tempDir) => {
    const configPath = path.join(tempDir, "config.yaml");
    const raw = {
      provider: { active: "openai", timeoutMs: 120000 },
      logging: { level: "info", writePromptFiles: true },
    };

    assert.throws(
      () => validateGlobalConfig(raw, configPath),
      /provider\.active must be one of copilot or claude/,
    );
  });
});

test("project config missing name fails with named error", async () => {
  await withTempDir(async (tempDir) => {
    const configPath = path.join(tempDir, "projects", "missing-name.yaml");
    await mkdir(path.dirname(configPath), { recursive: true });
    const raw = { repoPath: "../repo" };

    await assert.rejects(
      async () => validateProjectConfig(raw, configPath),
      /name must be a non-empty string/,
    );
  });
});

test("project config missing repoPath fails with named error", async () => {
  await withTempDir(async (tempDir) => {
    const configPath = path.join(tempDir, "projects", "missing-repo.yaml");
    await mkdir(path.dirname(configPath), { recursive: true });
    const raw = { name: "comm-service" };

    await assert.rejects(
      async () => validateProjectConfig(raw, configPath),
      /repoPath must be a non-empty string/,
    );
  });
});

test("project config repoPath must exist on disk", async () => {
  await withTempDir(async (tempDir) => {
    const configPath = path.join(tempDir, "projects", "missing-repo-dir.yaml");
    await mkdir(path.dirname(configPath), { recursive: true });
    const raw = { name: "comm-service", repoPath: "../does-not-exist" };

    await assert.rejects(
      async () => validateProjectConfig(raw, configPath),
      /repoPath does not exist on disk/,
    );
  });
});

test("project config sync.overwritePolicy only allows prompt", async () => {
  await withTempDir(async (tempDir) => {
    const repoDir = path.join(tempDir, "repo");
    await mkdir(repoDir, { recursive: true });
    const configPath = path.join(tempDir, "projects", "invalid-overwrite.yaml");
    await mkdir(path.dirname(configPath), { recursive: true });
    const raw = {
      name: "comm-service",
      repoPath: "../repo",
      sync: { overwritePolicy: "force" },
    };

    await assert.rejects(
      async () => validateProjectConfig(raw, configPath),
      /sync\.overwritePolicy must be prompt for MVP/,
    );
  });
});

test("valid global and project config pass without error", async () => {
  await withTempDir(async (tempDir) => {
    const configPath = path.join(tempDir, "config.yaml");
    const projectPath = path.join(tempDir, "projects", "comm-service.yaml");
    const repoDir = path.join(tempDir, "repo");
    await mkdir(repoDir, { recursive: true });
    await mkdir(path.dirname(projectPath), { recursive: true });

    const validGlobal = {
      provider: { active: "copilot", timeoutMs: 120000 },
      logging: { level: "info", writePromptFiles: true },
    };
    const validProject = {
      name: "comm-service",
      repoPath: "../repo",
      provider: "claude",
      sync: { overwritePolicy: "prompt" },
    };

    assert.doesNotThrow(() => validateGlobalConfig(validGlobal, configPath));
    await assert.doesNotReject(async () => validateProjectConfig(validProject, projectPath));
  });
});
