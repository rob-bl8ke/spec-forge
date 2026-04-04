import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { slugify, nextVersion, outputPath, artifactFileName } from "../../src/utils/naming";
import { stepIdToVariable } from "../../src/utils/stepId";

// ===== slugify Tests (with spec examples) =====

test("slugify converts spaces to dashes", () => {
  assert.equal(slugify("Campaign Retry"), "campaign-retry");
  assert.equal(slugify("Jira Task"), "jira-task");
  assert.equal(slugify("My New Feature"), "my-new-feature");
});

test("slugify removes special characters and converts to lowercase", () => {
  assert.equal(slugify("IMS / Retry Fix"), "ims-retry-fix");
  assert.equal(slugify("API@Retry!"), "apiretry");
  assert.equal(slugify("Retry###123"), "retry123");
});

test("slugify collapses multiple dashes", () => {
  assert.equal(slugify("--Already---Slugged--"), "already-slugged");
  assert.equal(slugify("  spaced   out  value  "), "spaced-out-value");
  assert.equal(slugify("___API@@@Retry###"), "apiretry");
});

test("slugify strips leading/trailing whitespace and special chars", () => {
  assert.equal(slugify("  Campaign Retry  "), "campaign-retry");
  assert.equal(slugify("---Retry---"), "retry");
});

test("slugify handles empty and whitespace-only input", () => {
  assert.equal(slugify(""), "");
  assert.equal(slugify("   "), "");
  assert.equal(slugify("---"), "");
});

// ===== nextVersion Tests =====

test("nextVersion increments v-prefixed version numbers", () => {
  assert.equal(nextVersion("v1"), "v2");
  assert.equal(nextVersion("v2"), "v3");
  assert.equal(nextVersion("v10"), "v11");
  assert.equal(nextVersion("v99"), "v100");
});

test("nextVersion defaults to v1 when given undefined", () => {
  assert.equal(nextVersion(undefined), "v1");
});

test("nextVersion handles non-standard version formats gracefully", () => {
  // Should still try to parse and increment
  assert.equal(nextVersion("v0"), "v1");
});

// ===== outputPath Tests =====

test("outputPath returns nested output folder structure", () => {
  assert.equal(
    outputPath("comm-service", "campaign-retry", "v1"),
    path.join("spec-forge", "output", "comm-service", "campaign-retry", "v1"),
  );
  assert.equal(
    outputPath("backend-api", "async-retry", "v2"),
    path.join("spec-forge", "output", "backend-api", "async-retry", "v2"),
  );
});

test("outputPath includes spec-forge prefix", () => {
  const result = outputPath("project", "feature", "v1");
  assert.ok(result.includes("spec-forge"));
  assert.ok(result.includes(path.join("output", "project", "feature", "v1")));
});

// ===== artifactFileName Tests =====

test("artifactFileName returns correct file names for all artifact types", () => {
  assert.equal(artifactFileName("requirements"), "requirements.md");
  assert.equal(artifactFileName("architecture"), "architecture.md");
  assert.equal(artifactFileName("jira-task"), "jira-task.md");
  assert.equal(artifactFileName("task-prompt"), "task-prompt.md");
});

test("artifactFileName adds .md extension", () => {
  const result = artifactFileName("requirements");
  assert.ok(result.endsWith(".md"));
});

// ===== stepIdToVariable Tests (step ID normalization) =====

test("stepIdToVariable converts dashes to underscores", () => {
  assert.equal(stepIdToVariable("jira-task"), "jira_task");
  assert.equal(stepIdToVariable("task-prompt"), "task_prompt");
  assert.equal(stepIdToVariable("requirements"), "requirements");
  assert.equal(stepIdToVariable("architecture"), "architecture");
});

test("stepIdToVariable handles single-word step IDs", () => {
  assert.equal(stepIdToVariable("requirements"), "requirements");
  assert.equal(stepIdToVariable("architecture"), "architecture");
});

test("stepIdToVariable produces valid template variable names", () => {
  // Should be usable in template {{variable_name}} syntax
  const result = stepIdToVariable("jira-task");
  assert.match(result, /^[a-z_]+$/);
});

test("artifact variables are mapped correctly in workflow context", () => {
  const artifactKeys = ["requirements", "architecture", "jira-task", "task-prompt"];
  const variables: Record<string, string> = {};

  for (const key of artifactKeys) {
    const variable = stepIdToVariable(key);
    variables[variable] = `content for ${key}`;
  }

  // Verify all expected variables are present and mapped
  assert.equal(variables.requirements, "content for requirements");
  assert.equal(variables.architecture, "content for architecture");
  assert.equal(variables.jira_task, "content for jira-task");
  assert.equal(variables.task_prompt, "content for task-prompt");
});
