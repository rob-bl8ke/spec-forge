import test from "node:test";
import assert from "node:assert/strict";
import { ClaudeAdapter } from "../../src/providers/ClaudeAdapter";
import type { ProviderRequest } from "../../src/providers/ProviderAdapter";

// Smoke prerequisites:
// 1) Run on Windows (win32)
// 2) Claude CLI installed and authenticated (`claude --help`)
// 3) Intended for manual invocation via `npm run test:smoke` or `npm run test:smoke:windows`

test("claude adapter smoke (Windows)", async (t) => {
  if (process.platform !== "win32") {
    t.skip("Skipped: Windows smoke test (platform is not win32).");
    return;
  }

  const adapter = new ClaudeAdapter();
  const available = await adapter.isAvailable();
  if (!available) {
    t.skip("Skipped: Claude CLI not available on this machine.");
    return;
  }

  const request: ProviderRequest = {
    prompt: "Reply with one short sentence confirming adapter smoke test.",
    workingDirectory: process.cwd(),
    timeoutMs: 120000,
  };

  const response = await adapter.generate(request);

  assert.equal(response.provider, "claude");
  assert.equal(response.exitCode, 0);
  assert.equal(response.timedOut, false);
  assert.ok(response.durationMs > 0);
  assert.ok(response.stdout.trim().length > 0);
});
