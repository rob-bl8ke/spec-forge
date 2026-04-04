import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import type { ConfigContext } from "../config/types";
import { resolveWorkingDir } from "./resolveWorkingDir";

test("repoPath set resolves to project repoPath", () => {
  const context = {
    rootDir: "C:/spec-forge",
    globalConfig: {
      provider: { active: "copilot", timeoutMs: 120000 },
      logging: { level: "info", writePromptFiles: true },
    },
    projectConfig: {
      name: "comm-service",
      repoPath: "../communication-service",
    },
    resolvedProvider: "copilot",
  } satisfies ConfigContext;

  const resolved = resolveWorkingDir(context, "C:/fallback");
  assert.equal(resolved, path.resolve("C:/spec-forge", "../communication-service"));
});

test("repoPath not set falls back to process cwd argument", () => {
  const context = {
    rootDir: "C:/spec-forge",
    globalConfig: {
      provider: { active: "copilot", timeoutMs: 120000 },
      logging: { level: "info", writePromptFiles: true },
    },
    resolvedProvider: "copilot",
  } satisfies ConfigContext;

  const resolved = resolveWorkingDir(context, "C:/workspace");
  assert.equal(resolved, "C:/workspace");
});
