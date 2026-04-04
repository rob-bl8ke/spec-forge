import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { loadWorkflow, WorkflowValidationError } from "./loadWorkflow";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-workflow-test-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("loadWorkflow loads typed workflow definition", async () => {
  await withTempDir(async (tempDir) => {
    await writeFile(path.join(tempDir, "config.yaml"), "provider:\n  active: copilot\n  timeoutMs: 120000\nlogging:\n  level: info\n  writePromptFiles: true\n", "utf8");
    await mkdir(path.join(tempDir, "workflows"), { recursive: true });

    await writeFile(
      path.join(tempDir, "workflows", "spec-to-tasks.yaml"),
      "id: spec-to-tasks\nsteps:\n  - id: requirements\n    prompt: prompts/spec-to-tasks/requirements.md\n    output: requirements.md\n",
      "utf8",
    );

    const workflow = await loadWorkflow("spec-to-tasks", tempDir);
    assert.equal(workflow.id, "spec-to-tasks");
    assert.equal(workflow.steps[0].id, "requirements");
    assert.equal(workflow.steps[0].output, "requirements.md");
  });
});

test("missing required step.output throws named validation error", async () => {
  await withTempDir(async (tempDir) => {
    await writeFile(path.join(tempDir, "config.yaml"), "provider:\n  active: copilot\n  timeoutMs: 120000\nlogging:\n  level: info\n  writePromptFiles: true\n", "utf8");
    await mkdir(path.join(tempDir, "workflows"), { recursive: true });

    await writeFile(
      path.join(tempDir, "workflows", "spec-to-tasks.yaml"),
      "id: spec-to-tasks\nsteps:\n  - id: requirements\n    prompt: prompts/spec-to-tasks/requirements.md\n",
      "utf8",
    );

    await assert.rejects(
      async () => loadWorkflow("spec-to-tasks", tempDir),
      (error: unknown) => error instanceof WorkflowValidationError && /steps\[0\]\.output/.test(error.message),
    );
  });
});

test("input field supports both string and array", async () => {
  await withTempDir(async (tempDir) => {
    await writeFile(path.join(tempDir, "config.yaml"), "provider:\n  active: copilot\n  timeoutMs: 120000\nlogging:\n  level: info\n  writePromptFiles: true\n", "utf8");
    await mkdir(path.join(tempDir, "workflows"), { recursive: true });

    await writeFile(
      path.join(tempDir, "workflows", "spec-to-tasks.yaml"),
      "id: spec-to-tasks\nsteps:\n  - id: architecture\n    prompt: prompts/spec-to-tasks/architecture.md\n    input: requirements\n    output: architecture.md\n  - id: jira-task\n    prompt: prompts/spec-to-tasks/jira-task.md\n    input:\n      - requirements\n      - architecture\n    output: jira-task.md\n",
      "utf8",
    );

    const workflow = await loadWorkflow("spec-to-tasks", tempDir);
    assert.deepEqual(workflow.steps[0].input, ["requirements"]);
    assert.deepEqual(workflow.steps[1].input, ["requirements", "architecture"]);
  });
});

test("workflow file not found names expected path", async () => {
  await withTempDir(async (tempDir) => {
    await writeFile(path.join(tempDir, "config.yaml"), "provider:\n  active: copilot\n  timeoutMs: 120000\nlogging:\n  level: info\n  writePromptFiles: true\n", "utf8");

    await assert.rejects(
      async () => loadWorkflow("does-not-exist", tempDir),
      /Workflow file not found:/,
    );
  });
});
