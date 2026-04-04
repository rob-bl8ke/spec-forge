import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import type { ConfigContext } from "../config/types";
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "./ProviderAdapter";
import { ProviderUnavailableError, runProviderCall } from "./runProvider";

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

const request: ProviderRequest = {
  prompt: "hello",
  timeoutMs: 120000,
};

test("runProviderCall checks isAvailable before generate", async () => {
  let isAvailableCalls = 0;
  let generateCalls = 0;

  const adapter: ProviderAdapter = {
    name: "copilot",
    async isAvailable(): Promise<boolean> {
      isAvailableCalls += 1;
      return true;
    },
    async generate(input: ProviderRequest): Promise<ProviderResponse> {
      generateCalls += 1;
      return {
        provider: "copilot",
        stdout: input.workingDirectory ?? "",
        stderr: "",
        exitCode: 0,
        durationMs: 1,
        timedOut: false,
      };
    },
  };

  const response = await runProviderCall(adapter, request, context);

  assert.equal(isAvailableCalls, 1);
  assert.equal(generateCalls, 1);
  assert.equal(response.stdout, path.resolve("C:/spec-forge", "../communication-service"));
});

test("runProviderCall fails fast with named error when provider unavailable", async () => {
  const adapter: ProviderAdapter = {
    name: "claude",
    async isAvailable(): Promise<boolean> {
      return false;
    },
    async generate(): Promise<ProviderResponse> {
      throw new Error("should not run");
    },
  };

  await assert.rejects(
    async () => runProviderCall(adapter, request, context),
    (error: unknown) => error instanceof ProviderUnavailableError && /claude/.test(error.message),
  );
});
