import test from "node:test";
import assert from "node:assert/strict";
import { confirmSync } from "./confirmSync";

test("returns confirmed=true without prompting when no pending changes", async () => {
  let called = false;

  const result = await confirmSync(
    { hasPendingChanges: false },
    {
      async confirmYesNo(): Promise<boolean> {
        called = true;
        return true;
      },
    },
  );

  assert.equal(called, false);
  assert.deepEqual(result, { confirmed: true, prompted: false });
});

test("prompts with exact text and resolves confirmed=true on y", async () => {
  let promptText = "";

  const result = await confirmSync(
    { hasPendingChanges: true },
    {
      async confirmYesNo(prompt: string): Promise<boolean> {
        promptText = prompt;
        return true;
      },
    },
  );

  assert.equal(promptText, "Apply changes? (y/n)");
  assert.deepEqual(result, { confirmed: true, prompted: true });
});

test("resolves confirmed=false and prints abort message on n", async () => {
  const printed: string[] = [];

  const result = await confirmSync(
    { hasPendingChanges: true },
    {
      async confirmYesNo(): Promise<boolean> {
        return false;
      },
    },
    (line) => printed.push(line),
  );

  assert.deepEqual(result, { confirmed: false, prompted: true });
  assert.equal(printed.length, 1);
  assert.equal(printed[0], "Sync aborted. No files were changed.");
});

test("supports re-prompt behavior by delegating to confirm service", async () => {
  let attempts = 0;

  const result = await confirmSync(
    { hasPendingChanges: true },
    {
      async confirmYesNo(): Promise<boolean> {
        attempts += 1;
        // Simulate a service that handles invalid inputs and eventually returns y.
        return true;
      },
    },
  );

  assert.equal(attempts, 1);
  assert.deepEqual(result, { confirmed: true, prompted: true });
});
