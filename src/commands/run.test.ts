import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { runCommandHandler } from "./run";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-run-test-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function seedWorkflowRoot(rootDir: string): Promise<void> {
  await writeFile(
    path.join(rootDir, "config.yaml"),
    "provider:\n  active: copilot\n  timeoutMs: 120000\nlogging:\n  level: info\n  writePromptFiles: true\n",
    "utf8",
  );
  await mkdir(path.join(rootDir, "workflows"), { recursive: true });
  await writeFile(
    path.join(rootDir, "workflows", "spec-to-tasks.yaml"),
    "id: spec-to-tasks\nsteps:\n  - id: requirements\n    prompt: prompts/spec-to-tasks/requirements.md\n    output: requirements.md\n  - id: architecture\n    prompt: prompts/spec-to-tasks/architecture.md\n    input: requirements\n    output: architecture.md\n",
    "utf8",
  );
}

test("spec-to-tasks resolves to full workflow dispatch", async () => {
  await withTempDir(async (tempDir) => {
    await seedWorkflowRoot(tempDir);

    let payload: unknown;
    await runCommandHandler(
      tempDir,
      "spec-to-tasks",
      { project: "comm-service" },
      async (input) => {
        payload = input;
      },
    );

    assert.deepEqual(payload, {
      target: {
        kind: "workflow",
        workflowId: "spec-to-tasks",
      },
      options: {
        project: "comm-service",
      },
    });
  });
});

test("architecture resolves to single-step dispatch", async () => {
  await withTempDir(async (tempDir) => {
    await seedWorkflowRoot(tempDir);

    let payload: unknown;
    await runCommandHandler(
      tempDir,
      "architecture",
      { project: "comm-service", feature: "campaign-retry", version: "v2" },
      async (input) => {
        payload = input;
      },
    );

    assert.deepEqual(payload, {
      target: {
        kind: "step",
        workflowId: "spec-to-tasks",
        stepId: "architecture",
      },
      options: {
        project: "comm-service",
        feature: "campaign-retry",
        version: "v2",
      },
    });
  });
});

test("unknown workflow-or-step errors with available workflow and step IDs", async () => {
  await withTempDir(async (tempDir) => {
    await seedWorkflowRoot(tempDir);

    await assert.rejects(
      async () => runCommandHandler(tempDir, "unknown", { project: "comm-service" }),
      /Unknown workflow-or-step 'unknown'.*spec-to-tasks.*architecture.*requirements/s,
    );
  });
});
