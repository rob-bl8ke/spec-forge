import test from "node:test";
import assert from "node:assert/strict";
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "./ProviderAdapter";
import { executeWithRetry } from "./executeWithRetry";

const baseRequest: ProviderRequest = {
  prompt: "Hello",
  timeoutMs: 20,
};

const adapter: ProviderAdapter = {
  name: "copilot",
  async isAvailable(): Promise<boolean> {
    return true;
  },
  async generate(): Promise<ProviderResponse> {
    return {
      provider: "copilot",
      stdout: "ok",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
      timedOut: false,
    };
  },
};

test("call exceeding timeoutMs returns timedOut true and does not retry", async () => {
  let calls = 0;

  const response = await executeWithRetry({
    adapter,
    request: { ...baseRequest, timeoutMs: 10 },
    runAttempt: async (_, signal) => {
      calls += 1;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), 30);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("aborted"));
        });
      });

      return {
        provider: "copilot",
        stdout: "late",
        stderr: "",
        exitCode: 0,
        durationMs: 30,
        timedOut: false,
      };
    },
  });

  assert.equal(calls, 1);
  assert.equal(response.timedOut, true);
});

test("non-zero exit retries exactly once", async () => {
  let calls = 0;

  const response = await executeWithRetry({
    adapter,
    request: baseRequest,
    runAttempt: async () => {
      calls += 1;
      return {
        provider: "copilot",
        stdout: "",
        stderr: "failed",
        exitCode: calls === 1 ? 2 : 0,
        durationMs: 1,
        timedOut: false,
      };
    },
  });

  assert.equal(calls, 2);
  assert.equal(response.exitCode, 0);
});

test("after one retry, still failing returns failure as-is", async () => {
  let calls = 0;

  const response = await executeWithRetry({
    adapter,
    request: baseRequest,
    runAttempt: async () => {
      calls += 1;
      return {
        provider: "copilot",
        stdout: "",
        stderr: "still failing",
        exitCode: 3,
        durationMs: 1,
        timedOut: false,
      };
    },
  });

  assert.equal(calls, 2);
  assert.equal(response.exitCode, 3);
  assert.equal(response.stderr, "still failing");
});

test("empty prompt fails immediately without retries", async () => {
  let calls = 0;

  const response = await executeWithRetry({
    adapter,
    request: { ...baseRequest, prompt: "   " },
    runAttempt: async () => {
      calls += 1;
      return {
        provider: "copilot",
        stdout: "",
        stderr: "",
        exitCode: 0,
        durationMs: 1,
        timedOut: false,
      };
    },
  });

  assert.equal(calls, 0);
  assert.equal(response.exitCode, 1);
});

test("stderr is preserved even when exit code is 0", async () => {
  const response = await executeWithRetry({
    adapter,
    request: baseRequest,
    runAttempt: async () => ({
      provider: "copilot",
      stdout: "ok",
      stderr: "warning output",
      exitCode: 0,
      durationMs: 1,
      timedOut: false,
    }),
  });

  assert.equal(response.exitCode, 0);
  assert.equal(response.stderr, "warning output");
  assert.equal(response.stdout, "ok");
});

test("unresolved variables fail immediately and are not retried", async () => {
  let calls = 0;

  const response = await executeWithRetry({
    adapter,
    request: { ...baseRequest, prompt: "Hello {{project_name}}" },
    runAttempt: async () => {
      calls += 1;
      return {
        provider: "copilot",
        stdout: "",
        stderr: "",
        exitCode: 0,
        durationMs: 1,
        timedOut: false,
      };
    },
  });

  assert.equal(calls, 0);
  assert.equal(response.exitCode, 1);
  assert.match(response.stderr, /unresolved variables/i);
});
