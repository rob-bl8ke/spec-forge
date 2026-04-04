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
} from "../../src/workflow/resolvePrompt";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-prompt-unit-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// ===== resolvePromptTemplateString Tests =====

test("all placeholders in template are substituted", () => {
  const template = "Project={{project_name}} Feature={{feature_name}} Input={{user_input}}";
  const variables: PromptVariables = {
    user_input: "build retries",
    project_name: "comm-service",
    feature_name: "campaign-retry",
    feature_slug: "campaign-retry",
    workflow_id: "spec-to-tasks",
    step_id: "requirements",
  };

  const resolved = resolvePromptTemplateString(template, variables, "test.md");
  assert.equal(resolved, "Project=comm-service Feature=campaign-retry Input=build retries");
});

test("missing variable throws error naming variable and file path", () => {
  assert.throws(
    () =>
      resolvePromptTemplateString(
        "Hello {{project_name}} {{missing_var}}",
        { project_name: "comm-service" },
        "C:/tmp/prompt.md",
      ),
    (err: unknown) => {
      const error = err as Error;
      return (
        error.message.includes("missing_var") &&
        error.message.includes("prompt.md")
      );
    },
  );
});

test("multiple missing variables fails on first one (fail-fast)", () => {
  assert.throws(
    () =>
      resolvePromptTemplateString(
        "{{var1}} and {{var2}}",
        {},
        "template.md",
      ),
    /var1/,
  );
});

test("empty template string resolves to empty output", () => {
  const resolved = resolvePromptTemplateString("", {}, "test.md");
  assert.equal(resolved, "");
});

test("template with no placeholders returns unchanged", () => {
  const template = "This is a plain template with no placeholders";
  const resolved = resolvePromptTemplateString(template, {}, "test.md");
  assert.equal(resolved, template);
});

test("placeholder names are case-sensitive", () => {
  assert.throws(
    () =>
      resolvePromptTemplateString(
        "{{Project_Name}}",
        { project_name: "comm-service" },
        "test.md",
      ),
    /Project_Name/,
  );
});

test("whitespace in placeholder is trimmed - successfully resolves", () => {
  // The regex /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/ DOES trim whitespace
  // So {{ project_name }} resolves as project_name
  const result = resolvePromptTemplateString(
    "{{ project_name }}",
    { project_name: "comm-service" },
    "test.md",
  );
  assert.equal(result, "comm-service");
});

// ===== resolvePrompt (File I/O) Tests =====

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

test("resolvePrompt throws when file does not exist", async () => {
  await assert.rejects(async () => {
    await resolvePrompt("/nonexistent/path/prompt.md", {});
  });
});

test("resolvePrompt preserves file formatting (newlines, indentation)", async () => {
  await withTempDir(async (tempDir) => {
    const promptPath = path.join(tempDir, "prompt.md");
    const content = "Line 1: {{var1}}\n  Indented: {{var2}}\nLine 3";
    await writeFile(promptPath, content, "utf8");

    const resolved = await resolvePrompt(promptPath, {
      var1: "value1",
      var2: "value2",
    });

    assert.equal(resolved, "Line 1: value1\n  Indented: value2\nLine 3");
  });
});

// ===== buildArtifactVariables Tests =====

test("artifact variables are mapped from step ID normalization", () => {
  const artifactVariables = buildArtifactVariables({
    "jira-task": "Jira body",
    "task-prompt": "Task prompt body",
  });

  assert.equal(artifactVariables.jira_task, "Jira body");
  assert.equal(artifactVariables.task_prompt, "Task prompt body");
});

test("artifact variables include single-word step IDs unchanged", () => {
  const artifactVariables = buildArtifactVariables({
    requirements: "Requirements content",
    architecture: "Architecture content",
  });

  assert.equal(artifactVariables.requirements, "Requirements content");
  assert.equal(artifactVariables.architecture, "Architecture content");
});

test("artifact variables handles all workflow artifact types", () => {
  const artifactVariables = buildArtifactVariables({
    requirements: "Requirements",
    architecture: "Architecture",
    "jira-task": "Tasks",
    "task-prompt": "Prompts",
  });

  assert.equal(artifactVariables.requirements, "Requirements");
  assert.equal(artifactVariables.architecture, "Architecture");
  assert.equal(artifactVariables.jira_task, "Tasks");
  assert.equal(artifactVariables.task_prompt, "Prompts");
});

test("buildArtifactVariables preserves content exactly", () => {
  const multilineContent = "Line 1\nLine 2\nLine 3";
  const artifactVariables = buildArtifactVariables({
    "jira-task": multilineContent,
  });

  assert.equal(artifactVariables.jira_task, multilineContent);
});

test("buildArtifactVariables handles empty content", () => {
  const artifactVariables = buildArtifactVariables({
    requirements: "",
  });

  assert.equal(artifactVariables.requirements, "");
});

// ===== Integration: Complete Variable Resolution Workflow =====

test("common workflow variables include all required context", async () => {
  await withTempDir(async (tempDir) => {
    const promptPath = path.join(tempDir, "prompt.md");
    const template = [
      "Project: {{project_name}}",
      "Feature: {{feature_name}}",
      "Slug: {{feature_slug}}",
      "Workflow: {{workflow_id}}",
      "Step: {{step_id}}",
      "Requirements: {{requirements}}",
      "Architecture: {{architecture}}",
    ].join("\n");

    await writeFile(promptPath, template, "utf8");

    const variables: PromptVariables = {
      project_name: "comm-service",
      feature_name: "Campaign Retry",
      feature_slug: "campaign-retry",
      workflow_id: "spec-to-tasks",
      step_id: "requirements",
      requirements: "# Requirements\n- Build retry feature",
      architecture: "# Architecture\n- Retry component",
      jira_task: "# Tasks\n## TASK-1",
      task_prompt: "# Task Prompts\n## TASK-1",
    };

    const resolved = await resolvePrompt(promptPath, variables);

    assert.ok(resolved.includes("comm-service"));
    assert.ok(resolved.includes("campaign-retry"));
    assert.ok(resolved.includes("spec-to-tasks"));
    assert.ok(resolved.includes("Build retry feature"));
  });
});
