import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { artifactFileName, nextVersion, outputPath, slugify } from "./naming";
import { stepIdToVariable } from "./stepId";

test("slugify follows spec examples", () => {
  assert.equal(slugify("Campaign Retry"), "campaign-retry");
  assert.equal(slugify("IMS / Retry Fix"), "ims-retry-fix");
});

test("slugify handles edge cases", () => {
  assert.equal(slugify("--Already---Slugged--"), "already-slugged");
  assert.equal(slugify("___API@@@Retry###"), "apiretry");
  assert.equal(slugify("  spaced   out  value  "), "spaced-out-value");
});

test("nextVersion increments and defaults", () => {
  assert.equal(nextVersion("v2"), "v3");
  assert.equal(nextVersion(undefined), "v1");
});

test("outputPath returns nested output folder path", () => {
  assert.equal(
    outputPath("comm-service", "campaign-retry", "v2"),
    path.join("spec-forge", "output", "comm-service", "campaign-retry", "v2"),
  );
});

test("artifact file naming and step variable normalization", () => {
  assert.equal(artifactFileName("jira-task"), "jira-task.md");
  assert.equal(stepIdToVariable("jira-task"), "jira_task");
  assert.equal(stepIdToVariable("task-prompt"), "task_prompt");
});
