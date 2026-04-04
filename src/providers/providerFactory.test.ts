import test from "node:test";
import assert from "node:assert/strict";
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "./ProviderAdapter";
import type { ConfigContext } from "../config/types";
import { clearProviderRegistry, registerProvider, resolveProvider, resolveProviderFromContext } from "./providerFactory";

const mockResponse: ProviderResponse = {
  provider: "copilot",
  stdout: "ok",
  stderr: "",
  exitCode: 0,
  durationMs: 1,
  timedOut: false,
};

const mockAdapter: ProviderAdapter = {
  name: "copilot",
  async isAvailable(): Promise<boolean> {
    return true;
  },
  async generate(_: ProviderRequest): Promise<ProviderResponse> {
    return mockResponse;
  },
};

test("resolveProvider returns active registered adapter", () => {
  clearProviderRegistry();
  registerProvider(mockAdapter);

  const resolved = resolveProvider("copilot");
  assert.equal(resolved.name, "copilot");
});

test("resolveProvider throws for unregistered provider", () => {
  clearProviderRegistry();

  assert.throws(
    () => resolveProvider("claude"),
    /No provider adapter registered for 'claude'/,
  );
});

test("resolveProviderFromContext uses active provider from config context", () => {
  clearProviderRegistry();
  registerProvider(mockAdapter);

  const context = {
    rootDir: ".",
    globalConfig: {
      provider: { active: "copilot", timeoutMs: 120000 },
      logging: { level: "info", writePromptFiles: true },
    },
    resolvedProvider: "copilot",
  } satisfies ConfigContext;

  const resolved = resolveProviderFromContext(context);
  assert.equal(resolved.name, "copilot");
});
