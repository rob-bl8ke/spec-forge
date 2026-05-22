import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { loadConfig, findSpecForgeRoot } from "../../src/config/loadConfig";
import { validateGlobalConfig, validateProjectConfig, ConfigValidationError } from "../../src/config/validateConfig";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-config-unit-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function writeGlobalConfig(tempDir: string, content: string): Promise<void> {
  await writeFile(path.join(tempDir, "config.yaml"), content, "utf8");
}

async function writeProjectConfig(tempDir: string, projectName: string, content: string): Promise<void> {
  const projectsDir = path.join(tempDir, "projects");
  await mkdir(projectsDir, { recursive: true });
  await writeFile(path.join(projectsDir, `${projectName}.yaml`), content, "utf8");
}

// ===== findSpecForgeRoot Tests =====

test("findSpecForgeRoot locates config.yaml from a nested directory", async () => {
  await withTempDir(async (tempDir) => {
    await writeGlobalConfig(
      tempDir,
      "provider:\n  active: copilot\n  timeoutMs: 120000\nlogging:\n  level: info\n  writePromptFiles: true\n",
    );

    const nestedDir = path.join(tempDir, "a", "b", "c");
    await mkdir(nestedDir, { recursive: true });

    const root = await findSpecForgeRoot(nestedDir);
    assert.equal(root, tempDir);
  });
});

test("findSpecForgeRoot throws clear error when config.yaml is absent", async () => {
  await withTempDir(async (tempDir) => {
    const nestedDir = path.join(tempDir, "a", "b", "c");
    await mkdir(nestedDir, { recursive: true });

    await assert.rejects(
      async () => findSpecForgeRoot(nestedDir),
      /Could not find config\.yaml by walking up from/,
    );
  });
});

// ===== validateGlobalConfig Tests =====

test("validateGlobalConfig accepts valid minimal config", () => {
  const config = validateGlobalConfig(
    {
      provider: {
        active: "copilot",
        timeoutMs: 120000,
      },
      logging: {
        level: "info",
        writePromptFiles: false,
      },
    },
    "config.yaml",
  );

  assert.equal(config.provider.active, "copilot");
  assert.equal(config.logging.level, "info");
});

test("validateGlobalConfig rejects missing provider.active", () => {
  assert.throws(
    () =>
      validateGlobalConfig(
        {
          provider: {
            timeoutMs: 120000,
          },
          logging: {
            level: "info",
            writePromptFiles: false,
          },
        },
        "config.yaml",
      ),
    (err: unknown) => {
      const error = err as ConfigValidationError;
      return error instanceof ConfigValidationError && error.field === "provider.active";
    },
  );
});

test("validateGlobalConfig rejects invalid provider.active value", () => {
  assert.throws(
    () =>
      validateGlobalConfig(
        {
          provider: {
            active: "invalid-provider",
            timeoutMs: 120000,
          },
          logging: {
            level: "info",
            writePromptFiles: false,
          },
        },
        "config.yaml",
      ),
    (err: unknown) => {
      const error = err as ConfigValidationError;
      return error instanceof ConfigValidationError && error.field === "provider.active";
    },
  );
});

test("validateGlobalConfig rejects missing logging.level", () => {
  assert.throws(
    () =>
      validateGlobalConfig(
        {
          provider: {
            active: "copilot",
            timeoutMs: 120000,
          },
          logging: {
            writePromptFiles: false,
          },
        },
        "config.yaml",
      ),
    (err: unknown) => {
      const error = err as ConfigValidationError;
        return error instanceof ConfigValidationError && error.field === "level";
    },
  );
});

test("validateGlobalConfig error includes file path context", () => {
  const configPath = "/etc/spec-forge/config.yaml";
  assert.throws(
    () =>
      validateGlobalConfig(
        {
          provider: {
            timeoutMs: 120000,
          },
          logging: {
            level: "info",
            writePromptFiles: false,
          },
        },
        configPath,
      ),
    (err: unknown) => {
      const error = err as ConfigValidationError;
      return error instanceof ConfigValidationError && 
             error.message.includes("config.yaml");
    },
  );
});

// ===== validateProjectConfig Tests =====

test("validateProjectConfig accepts valid project config", async () => {
  await withTempDir(async (tempDir) => {
    const repoDir = path.join(tempDir, "repo");
    await mkdir(repoDir, { recursive: true });

    const config = await validateProjectConfig(
      {
        name: "comm-service",
        repoPath: repoDir,
        provider: "claude",
        sync: {
          overwritePolicy: "prompt",
        },
      },
      "projects/comm-service.yaml",
    );

    assert.equal(config.name, "comm-service");
    assert.equal(config.provider, "claude");
  });
});

test("validateProjectConfig rejects missing name", async () => {
  await withTempDir(async (tempDir) => {
    const repoDir = path.join(tempDir, "repo");
    await mkdir(repoDir, { recursive: true });

    await assert.rejects(
      async () =>
        validateProjectConfig(
          {
            repoPath: repoDir,
            provider: "claude",
            sync: {
              overwritePolicy: "prompt",
            },
          },
          "projects/project.yaml",
        ),
      (err: unknown) => {
        const error = err as ConfigValidationError;
        return error instanceof ConfigValidationError && error.field === "name";
      },
    );
  });
});

test("validateProjectConfig rejects missing repoPath", async () => {
  await withTempDir(async (tempDir) => {
    await assert.rejects(
      async () =>
        validateProjectConfig(
          {
            name: "comm-service",
            provider: "claude",
            sync: {
              overwritePolicy: "prompt",
            },
          },
          "projects/comm-service.yaml",
        ),
      (err: unknown) => {
        const error = err as ConfigValidationError;
        return error instanceof ConfigValidationError && error.field === "repoPath";
      },
    );
  });
});

test("validateProjectConfig rejects repoPath that does not exist on disk", async () => {
  await withTempDir(async (tempDir) => {
    const nonexistentPath = path.join(tempDir, "nonexistent");

    await assert.rejects(
      async () =>
        validateProjectConfig(
          {
            name: "comm-service",
            repoPath: nonexistentPath,
            provider: "claude",
            sync: {
              overwritePolicy: "prompt",
            },
          },
          "projects/comm-service.yaml",
        ),
        /does not exist on disk/,
    );
  });
});

test("validateProjectConfig rejects invalid overwritePolicy", async () => {
  await withTempDir(async (tempDir) => {
    const repoDir = path.join(tempDir, "repo");
    await mkdir(repoDir, { recursive: true });

    await assert.rejects(
      async () =>
        validateProjectConfig(
          {
            name: "comm-service",
            repoPath: repoDir,
            provider: "claude",
            sync: {
              overwritePolicy: "invalid-policy" as unknown,
            },
          },
          "projects/comm-service.yaml",
        ),
      (err: unknown) => {
        const error = err as ConfigValidationError;
        return error instanceof ConfigValidationError && error.field === "sync.overwritePolicy";
      },
    );
  });
});

test("validateGlobalConfig accepts optional model field", () => {
  const config = validateGlobalConfig(
    {
      provider: {
        active: "copilot",
        timeoutMs: 120000,
        model: "gpt-4.1",
      },
      logging: {
        level: "info",
        writePromptFiles: false,
      },
    },
    "config.yaml",
  );

  assert.equal(config.provider.model, "gpt-4.1");
});

test("validateGlobalConfig sets model to undefined when omitted", () => {
  const config = validateGlobalConfig(
    {
      provider: {
        active: "copilot",
        timeoutMs: 120000,
      },
      logging: {
        level: "info",
        writePromptFiles: false,
      },
    },
    "config.yaml",
  );

  assert.equal(config.provider.model, undefined);
});

test("validateProjectConfig accepts optional model string", async () => {
  await withTempDir(async (tempDir) => {
    const repoDir = path.join(tempDir, "repo");
    await mkdir(repoDir, { recursive: true });

    const config = await validateProjectConfig(
      {
        name: "comm-service",
        repoPath: repoDir,
        model: "claude-opus-4-5",
      },
      "projects/comm-service.yaml",
    );

    assert.equal(config.model, "claude-opus-4-5");
  });
});

test("validateProjectConfig rejects non-string model", async () => {
  await withTempDir(async (tempDir) => {
    const repoDir = path.join(tempDir, "repo");
    await mkdir(repoDir, { recursive: true });

    await assert.rejects(
      async () =>
        validateProjectConfig(
          {
            name: "comm-service",
            repoPath: repoDir,
            model: 42 as unknown,
          },
          "projects/comm-service.yaml",
        ),
      (err: unknown) => {
        const error = err as ConfigValidationError;
        return error instanceof ConfigValidationError && error.field === "model";
      },
    );
  });
});

test("validateProjectConfig accepts sync.targets with valid string paths", async () => {
  await withTempDir(async (tempDir) => {
    const repoDir = path.join(tempDir, "repo");
    await mkdir(repoDir, { recursive: true });

    const config = await validateProjectConfig(
      {
        name: "comm-service",
        repoPath: repoDir,
        sync: {
          targetDir: ".github/spec-forge",
          targets: {
            skills: ".github/prompts",
            instructions: ".github",
          },
        },
      },
      "projects/comm-service.yaml",
    );

    assert.equal(config.sync?.targets?.skills, ".github/prompts");
    assert.equal(config.sync?.targets?.instructions, ".github");
    assert.equal(config.sync?.targets?.knowledge, undefined);
  });
});

test("validateProjectConfig rejects non-string sync.targets.skills", async () => {
  await withTempDir(async (tempDir) => {
    const repoDir = path.join(tempDir, "repo");
    await mkdir(repoDir, { recursive: true });

    await assert.rejects(
      async () =>
        validateProjectConfig(
          {
            name: "comm-service",
            repoPath: repoDir,
            sync: {
              targets: {
                skills: 123 as unknown,
              },
            },
          },
          "projects/comm-service.yaml",
        ),
      (err: unknown) => {
        const error = err as ConfigValidationError;
        return error instanceof ConfigValidationError && error.field === "sync.targets.skills";
      },
    );
  });
});

// ===== loadConfig Integration Tests =====

test("loadConfig applies project provider override over global provider.active", async () => {
  await withTempDir(async (tempDir) => {
    await writeGlobalConfig(
      tempDir,
      "provider:\n  active: copilot\n  timeoutMs: 120000\nlogging:\n  level: info\n  writePromptFiles: true\n",
    );

    const repoDir = path.join(tempDir, "repo");
    await mkdir(repoDir, { recursive: true });

    await writeProjectConfig(
      tempDir,
      "comm-service",
      "name: comm-service\nprovider: claude\nrepoPath: ./repo\nsync:\n  overwritePolicy: prompt\n",
    );

    const context = await loadConfig({ cwd: tempDir, projectName: "comm-service" });

    assert.equal(context.globalConfig.provider.active, "copilot");
    assert.equal(context.projectConfig?.provider, "claude");
    assert.equal(context.resolvedProvider, "claude");
  });
});

test("loadConfig uses global provider when project has no provider override", async () => {
  await withTempDir(async (tempDir) => {
    await writeGlobalConfig(
      tempDir,
      "provider:\n  active: copilot\n  timeoutMs: 120000\nlogging:\n  level: info\n  writePromptFiles: true\n",
    );

    const repoDir = path.join(tempDir, "repo");
    await mkdir(repoDir, { recursive: true });

    await writeProjectConfig(
      tempDir,
      "comm-service",
      "name: comm-service\nrepoPath: ./repo\nsync:\n  overwritePolicy: prompt\n",
    );

    const context = await loadConfig({ cwd: tempDir, projectName: "comm-service" });

    assert.equal(context.resolvedProvider, "copilot");
  });
});

test("loadConfig without projectName still loads global config", async () => {
  await withTempDir(async (tempDir) => {
    await writeGlobalConfig(
      tempDir,
      "provider:\n  active: copilot\n  timeoutMs: 120000\nlogging:\n  level: info\n  writePromptFiles: false\n",
    );

    const context = await loadConfig({ cwd: tempDir });

    assert.equal(context.globalConfig.provider.active, "copilot");
    assert.equal(context.projectConfig, undefined);
    assert.equal(context.resolvedProvider, "copilot");
  });
});
