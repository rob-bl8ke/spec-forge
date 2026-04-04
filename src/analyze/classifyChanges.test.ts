import test from "node:test";
import assert from "node:assert/strict";
import { classifyChanges } from "./classifyChanges";

function makeInput(overrides?: Partial<Parameters<typeof classifyChanges>[0]>) {
  return {
    project: "comm-service",
    feature: "campaign-retry",
    fromVersion: "v1",
    toVersion: "v2",
    artifacts: {
      requirements: {
        from: "# Requirements\n## Functional Requirements\n- Keep retries bounded",
        to: "# Requirements\n## Functional Requirements\n- Keep retries bounded\n- Add jitter",
      },
      architecture: {
        from: "# Architecture\n## Components\n- API\n- Worker",
        to: "# Architecture\n## Components\n- API\n- Worker\n- RetryScheduler",
      },
      jiraTask: {
        from: [
          "# Tasks",
          "## TASK-1: Add retry policy",
          "Implement bounded retries.",
          "",
          "## TASK-2: Add metrics",
          "Emit retry counters.",
          "",
          "## TASK-3: Remove legacy path",
          "Delete old retry branch.",
        ].join("\n"),
        to: [
          "# Tasks",
          "## TASK-1: Add retry policy",
          "Implement bounded retries.",
          "",
          "## TASK-2: Add metrics",
          "Emit retry counters with status labels.",
          "",
          "## TASK-4: Add jitter support",
          "Implement jitter algorithm.",
        ].join("\n"),
      },
      taskPrompt: {
        from: "# Task Prompts\n## TASK-1\nPrompt A",
        to: "# Task Prompts\n## TASK-1\nPrompt A\n## TASK-4\nPrompt B",
      },
    },
    ...overrides,
  };
}

test("requirements and architecture produce summary string lists", () => {
  const result = classifyChanges(makeInput());

  assert.ok(result.requirementsChanges.length > 0);
  assert.ok(result.architectureChanges.length > 0);
  assert.match(result.requirementsChanges.join("\n"), /Added|Removed|No requirements changes/);
  assert.match(result.architectureChanges.join("\n"), /Added|Removed|No architecture changes/);
});

test("task present in both versions with identical content is unchanged", () => {
  const result = classifyChanges(makeInput());

  assert.deepEqual(result.jiraTaskImpact.unchanged, [
    { taskId: "TASK-1", title: "Add retry policy" },
  ]);
});

test("task present in both versions with different content is modified", () => {
  const result = classifyChanges(makeInput());

  assert.equal(result.jiraTaskImpact.modified.length, 1);
  assert.equal(result.jiraTaskImpact.modified[0].taskId, "TASK-2");
  assert.match(result.jiraTaskImpact.modified[0].change, /content changed/);
});

test("task present in from-version but missing in to-version is removed", () => {
  const result = classifyChanges(makeInput());

  assert.equal(result.jiraTaskImpact.removed.length, 1);
  assert.equal(result.jiraTaskImpact.removed[0].taskId, "TASK-3");
  assert.match(result.jiraTaskImpact.removed[0].reason, /not present in to-version/);
});

test("task present in to-version but missing in from-version is new", () => {
  const result = classifyChanges(makeInput());

  assert.equal(result.jiraTaskImpact.new.length, 1);
  assert.equal(result.jiraTaskImpact.new[0].taskId, "TASK-4");
  assert.match(result.jiraTaskImpact.new[0].reason, /new in to-version/);
});

test("task identity uses TASK-<number> IDs, not title matching", () => {
  const input = makeInput({
    artifacts: {
      ...makeInput().artifacts,
      jiraTask: {
        from: [
          "# Tasks",
          "## TASK-1: Shared Title",
          "Old content.",
        ].join("\n"),
        to: [
          "# Tasks",
          "## TASK-99: Shared Title",
          "Old content.",
        ].join("\n"),
      },
    },
  });

  const result = classifyChanges(input);

  assert.equal(result.jiraTaskImpact.unchanged.length, 0);
  assert.equal(result.jiraTaskImpact.removed[0].taskId, "TASK-1");
  assert.equal(result.jiraTaskImpact.new[0].taskId, "TASK-99");
});

test("task-prompt impact returns changed boolean and summary", () => {
  const result = classifyChanges(makeInput());

  assert.equal(result.taskPromptImpact.changed, true);
  assert.match(result.taskPromptImpact.summary, /changed between versions/);
});