import test from "node:test";
import assert from "node:assert/strict";
import { isSuccessful, type ProviderResponse } from "./ProviderAdapter";

function buildResponse(overrides: Partial<ProviderResponse> = {}): ProviderResponse {
  return {
    provider: "copilot",
    stdout: "output",
    stderr: "",
    exitCode: 0,
    durationMs: 100,
    timedOut: false,
    ...overrides,
  };
}

test("isSuccessful returns false for non-zero exit", () => {
  assert.equal(isSuccessful(buildResponse({ exitCode: 1 })), false);
});

test("isSuccessful returns false for timed out response", () => {
  assert.equal(isSuccessful(buildResponse({ timedOut: true })), false);
});

test("isSuccessful returns false for empty stdout", () => {
  assert.equal(isSuccessful(buildResponse({ stdout: "   " })), false);
});

test("isSuccessful returns true for exit 0, not timed out, non-empty stdout", () => {
  assert.equal(isSuccessful(buildResponse()), true);
});
