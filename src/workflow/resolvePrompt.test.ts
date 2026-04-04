import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import {
  buildArtifactVariables,
  resolvePrompt,
  resolvePromptTemplateString,
  type PromptVariables,
} from "./resolvePrompt";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-resolve-prompt-test-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("all placeholders in prompt file are substituted", async () => {
  await withTempDir(async (tempDir) => {
    const promptPath = path.join(tempDir, "requirements.md");
    await writeFile(
      promptPath,
      "Project={{project_name}} Feature={{feature_name}} Input={{user_input}}",
      "utf8",
    );

    const variables: PromptVariables = {
      user_input: "build retries",
      project_name: "comm-service",
      feature_name: "campaign-retry",
      feature_slug: "campaign-retry",
      workflow_id: "spec-to-tasks",
      step_id: "requirements",
    };

    const resolved = await resolvePrompt(promptPath, variables);
    assert.equal(
      resolved,
      "Project=comm-service Feature=campaign-retry Input=build retries",
    );
  });
});

test("missing variable throws error naming variable and prompt file", () => {
  assert.throws(
    () =>
      resolvePromptTemplateString(
        "Hello {{project_name}} {{missing_var}}",
        { project_name: "comm-service" },
        "C:/tmp/prompt.md",
      ),
    /Missing variable 'missing_var'.*prompt\.md/,
  );
});

test("artifact variables are mapped from step ID normalization", () => {
  const artifactVariables = buildArtifactVariables({
    "jira-task": "Jira body",
    "task-prompt": "Task prompt body",
  });

  assert.equal(artifactVariables.jira_task, "Jira body");
  assert.equal(artifactVariables.task_prompt, "Task prompt body");
});
