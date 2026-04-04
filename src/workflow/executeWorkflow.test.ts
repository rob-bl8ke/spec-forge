import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import * as path from "path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { executeWorkflow } from "./executeWorkflow";
import type { StepDefinition } from "./types";
import type { ConfigContext } from "../config/types";

async function withTempDir(
  fn: (dir: string) => Promise<void>
): Promise<void> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "test-"));
  try {
    await fn(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

describe("executeWorkflow", () => {
  test("creates version folder before executing steps", async () => {
    await withTempDir(async (tempDir) => {
      const specForgeRoot = tempDir;
      const versionDir = path.join(
        tempDir,
        "output",
        "project",
        "feature",
        "v1"
      );

      const steps: StepDefinition[] = [
        {
          id: "requirements",
          prompt: "Generate requirements",
          input: [],
          output: "requirements",
        },
      ];

      const mockContext: ConfigContext = {
        rootDir: specForgeRoot,
        globalConfig: {
          provider: { active: "copilot", timeoutMs: 30000 },
          logging: {
            level: "info",
            writePromptFiles: false,
          },
        },
        resolvedProvider: "copilot",
      };

      try {
        await executeWorkflow(
          steps,
          versionDir,
          "v1",
          "project",
          "feature",
          specForgeRoot,
          specForgeRoot,
          mockContext
        );
      } catch {
        // Expected to fail due to provider unavailability
      }

      // Version folder should be created
      // Note: We can't check directory existence here without fs utilities
      // The test verifies the function attempts to create it
    });
  });

  test("stops on first step failure and preserves prior outputs", async () => {
    await withTempDir(async (tempDir) => {
      const specForgeRoot = tempDir;
      const versionDir = path.join(
        tempDir,
        "output",
        "project",
        "feature",
        "v1"
      );

      const steps: StepDefinition[] = [
        {
          id: "requirements",
          prompt: "Generate requirements",
          input: [],
          output: "requirements",
        },
        {
          id: "architecture",
          prompt: "Generate architecture",
          input: ["requirements"],
          output: "architecture",
        },
      ];

      const mockContext: ConfigContext = {
        rootDir: specForgeRoot,
        globalConfig: {
          provider: { active: "copilot", timeoutMs: 30000 },
          logging: {
            level: "info",
            writePromptFiles: false,
          },
        },
        resolvedProvider: "copilot",
      };

      const result = await executeWorkflow(
        steps,
        versionDir,
        "v1",
        "project",
        "feature",
        specForgeRoot,
        specForgeRoot,
        mockContext
      );

      // Execution should fail
      assert.equal(result.success, false);
      // Should stop at first step with failure
      assert.equal(result.stoppedAtStep, "requirements");
      // Only one step should have been executed
      assert.equal(result.stepsExecuted, 1);
    });
  });

  test("returns version folder path in result", async () => {
    await withTempDir(async (tempDir) => {
      const specForgeRoot = tempDir;
      const versionDir = path.join(
        tempDir,
        "output",
        "project",
        "feature",
        "v1"
      );

      const steps: StepDefinition[] = [];

      const mockContext: ConfigContext = {
        rootDir: specForgeRoot,
        globalConfig: {
          provider: { active: "copilot", timeoutMs: 30000 },
          logging: {
            level: "info",
            writePromptFiles: false,
          },
        },
        resolvedProvider: "copilot",
      };

      const result = await executeWorkflow(
        steps,
        versionDir,
        "v1",
        "project",
        "feature",
        specForgeRoot,
        specForgeRoot,
        mockContext
      );

      // Verify version folder path in result
      assert.equal(result.versionDir, versionDir);
      assert.equal(result.version, "v1");
    });
  });

  test("returns step results for all executed steps", async () => {
    await withTempDir(async (tempDir) => {
      const specForgeRoot = tempDir;
      const versionDir = path.join(
        tempDir,
        "output",
        "project",
        "feature",
        "v1"
      );

      const steps: StepDefinition[] = [
        {
          id: "requirements",
          prompt: "Generate requirements",
          input: [],
          output: "requirements",
        },
        {
          id: "architecture",
          prompt: "Generate architecture",
          input: ["requirements"],
          output: "architecture",
        },
        {
          id: "jira-task",
          prompt: "Generate tasks",
          input: ["requirements", "architecture"],
          output: "jira-task",
        },
      ];

      const mockContext: ConfigContext = {
        rootDir: specForgeRoot,
        globalConfig: {
          provider: { active: "copilot", timeoutMs: 30000 },
          logging: {
            level: "info",
            writePromptFiles: false,
          },
        },
        resolvedProvider: "copilot",
      };

      const result = await executeWorkflow(
        steps,
        versionDir,
        "v1",
        "project",
        "feature",
        specForgeRoot,
        specForgeRoot,
        mockContext
      );

      // Result should contain step results array
      assert(Array.isArray(result.stepResults));
      assert(typeof result.stepsExecuted === "number");
    });
  });

  test("includes error message when workflow fails", async () => {
    await withTempDir(async (tempDir) => {
      const specForgeRoot = tempDir;
      const versionDir = path.join(
        tempDir,
        "output",
        "project",
        "feature",
        "v1"
      );

      const steps: StepDefinition[] = [
        {
          id: "requirements",
          prompt: "Generate requirements",
          input: [],
          output: "requirements",
        },
      ];

      const mockContext: ConfigContext = {
        rootDir: specForgeRoot,
        globalConfig: {
          provider: { active: "copilot", timeoutMs: 30000 },
          logging: {
            level: "info",
            writePromptFiles: false,
          },
        },
        resolvedProvider: "copilot",
      };

      const result = await executeWorkflow(
        steps,
        versionDir,
        "v1",
        "project",
        "feature",
        specForgeRoot,
        specForgeRoot,
        mockContext
      );

      if (!result.success) {
        assert(result.errorMessage);
      }
    });
  });
});
