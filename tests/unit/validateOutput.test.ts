import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { validateOutput, handleValidationFailure } from "../../src/workflow/validateOutput";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-validate-unit-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// ===== Requirements Artifact Validation =====

test("requirements artifact with all required headings passes validation", () => {
  const output = [
    "# Requirements",
    "## Feature Summary",
    "## Functional Requirements",
    "## Non-Functional Requirements",
    "## Constraints",
    "## Assumptions",
    "## Open Questions",
  ].join("\n");

  const result = validateOutput("requirements", output);
  assert.equal(result.valid, true);
  assert.equal(result.error, undefined);
});

test("requirements artifact missing any required heading fails validation", () => {
  const output = [
    "# Requirements",
    "## Feature Summary",
    "## Functional Requirements",
    // Missing Non-Functional Requirements
    "## Constraints",
    "## Assumptions",
    "## Open Questions",
  ].join("\n");

  const result = validateOutput("requirements", output);
  assert.equal(result.valid, false);
  assert.ok(result.error?.includes("Missing required headings"));
});

test("requirements artifact validation requires all six required sub-headings", () => {
  const requiredHeadings = [
    "Feature Summary",
    "Functional Requirements",
    "Non-Functional Requirements",
    "Constraints",
    "Assumptions",
    "Open Questions",
  ];

  // Start with valid base
  const base = [
    "# Requirements",
    "## Feature Summary - content",
    "## Functional Requirements - content",
    "## Non-Functional Requirements - content",
    "## Constraints - content",
    "## Assumptions - content",
    "## Open Questions - content",
  ];

  // Test each individual heading requirement
  for (let i = 0; i < requiredHeadings.length; i++) {
    const missingHeading = base.filter((_, idx) => idx !== i + 1).join("\n");
    const result = validateOutput("requirements", missingHeading);
    assert.equal(result.valid, false, `Should fail when missing ${requiredHeadings[i]}`);
  }
});

// ===== Architecture Artifact Validation =====

test("architecture artifact with all required headings passes validation", () => {
  const output = [
    "# Architecture",
    "## Overview",
    "## Components",
    "## Data Flow",
    "## Key Design Decisions",
    "## Failure Handling",
    "## Observability",
    "## Risks and Trade-offs",
  ].join("\n");

  const result = validateOutput("architecture", output);
  assert.equal(result.valid, true);
  assert.equal(result.error, undefined);
});

test("architecture artifact missing any required heading fails validation", () => {
  const output = [
    "# Architecture",
    "## Overview",
    "## Components",
    "## Data Flow",
    // Missing Key Design Decisions
    "## Failure Handling",
    "## Observability",
    "## Risks and Trade-offs",
  ].join("\n");

  const result = validateOutput("architecture", output);
  assert.equal(result.valid, false);
  assert.ok(result.error?.includes("Missing required headings"));
});

test("architecture artifact validation requires all seven required sub-headings", () => {
  const requiredHeadings = [
    "Overview",
    "Components",
    "Data Flow",
    "Key Design Decisions",
    "Failure Handling",
    "Observability",
    "Risks and Trade-offs",
  ];

  // Start with valid base
  const base = [
    "# Architecture",
    "## Overview - content",
    "## Components - content",
    "## Data Flow - content",
    "## Key Design Decisions - content",
    "## Failure Handling - content",
    "## Observability - content",
    "## Risks and Trade-offs - content",
  ];

  // Test each individual heading requirement
  for (let i = 0; i < requiredHeadings.length; i++) {
    const missingHeading = base.filter((_, idx) => idx !== i + 1).join("\n");
    const result = validateOutput("architecture", missingHeading);
    assert.equal(result.valid, false, `Should fail when missing ${requiredHeadings[i]}`);
  }
});

// ===== Jira Task Artifact Validation =====

test("jira-task artifact validates root heading and TASK pattern", () => {
  const output = "# Tasks\n## TASK-1: Implement\n## TASK-2: Test\n";
  const result = validateOutput("jira-task", output);
  assert.equal(result.valid, true);
});

test("jira-task artifact accepts legacy 'Jira Tasks' root heading", () => {
  const output = "# Jira Tasks\n## TASK-1: Implement\n";
  const result = validateOutput("jira-task", output);
  assert.equal(result.valid, true);
});

test("jira-task artifact without TASK headings fails validation", () => {
  const output = "# Tasks\n## Other Section\n## Another Section\n";
  const result = validateOutput("jira-task", output);
  assert.equal(result.valid, false);
  assert.ok(result.error?.includes("TASK headings"));
});

test("jira-task artifact requires TASK-<number> pattern", () => {
  // Valid TASK-number patterns
  const validOutputs = [
    "# Tasks\n## TASK-1: First\n",
    "# Tasks\n## TASK-99: Ninety-ninth\n",
    "# Tasks\n## TASK-1: First\n## TASK-2: Second\n## TASK-10: Tenth\n",
  ];

  for (const output of validOutputs) {
    const result = validateOutput("jira-task", output);
    assert.equal(result.valid, true, `Should accept ${output}`);
  }

  // Invalid TASK patterns
  const invalidOutputs = [
    "# Tasks\n## Task-1: Invalid prefix\n",
    "# Tasks\n## TASK1: No dash\n",
    "# Tasks\n## TASK-a: Letter instead of number\n",
    "# Tasks\n## TASKID-1: Wrong format\n",
  ];

  for (const output of invalidOutputs) {
    const result = validateOutput("jira-task", output);
    assert.equal(result.valid, false, `Should reject ${output}`);
  }
});

test("jira-task validates with multiple tasks", () => {
  const output = [
    "# Tasks",
    "## TASK-1: Add retry policy",
    "Implementation details here",
    "",
    "## TASK-2: Emit metrics",
    "Metrics details here",
    "",
    "## TASK-3: Add jitter",
    "Jitter details here",
  ].join("\n");

  const result = validateOutput("jira-task", output);
  assert.equal(result.valid, true);
});

// ===== Task Prompt Artifact Validation =====

test("task-prompt artifact validates root heading and TASK pattern", () => {
  const output = "# Task Prompts\n## TASK-1\nPrompt for task 1\n";
  const result = validateOutput("task-prompt", output);
  assert.equal(result.valid, true);
});

test("task-prompt artifact requires TASK-<number> pattern", () => {
  // Valid
  const valid = "# Task Prompts\n## TASK-1\nContent\n## TASK-2\nContent\n";
  assert.equal(validateOutput("task-prompt", valid).valid, true);

  // Invalid
  const invalid1 = "# Task Prompts\n## Task-1\nContent\n";
  assert.equal(validateOutput("task-prompt", invalid1).valid, false);

  const invalid2 = "# Task Prompts\n## TASK1\nContent\n";
  assert.equal(validateOutput("task-prompt", invalid2).valid, false);
});

test("task-prompt validates with multiple tasks", () => {
  const output = [
    "# Task Prompts",
    "## TASK-1",
    "Build a retry policy that keeps bounded retry attempts.",
    "",
    "## TASK-2",
    "Emit retry metrics with status dimensions.",
    "",
    "## TASK-10",
    "Add jitter algorithm to retry backoff.",
  ].join("\n");

  const result = validateOutput("task-prompt", output);
  assert.equal(result.valid, true);
});

// ===== Error Handling Tests =====

test("validateOutput returns descriptive error message", () => {
  const output = "# Requirements\n## Feature Summary\n";
  const result = validateOutput("requirements", output);
  assert.equal(result.valid, false);
  assert.ok(result.error);
  assert.ok(result.error.length > 0);
});

test("validateOutput fails on missing root heading", () => {
  const output = "## Feature Summary\n## Functional Requirements\n";
  const result = validateOutput("requirements", output);
  assert.equal(result.valid, false);
});

test("validateOutput is case-sensitive for TASK-<number> pattern", () => {
  // lowercase 'task' should fail
  const output1 = "# Task Prompts\n## task-1\nContent\n";
  assert.equal(validateOutput("task-prompt", output1).valid, false);

  // UPPERCASE but wrong format
  const output2 = "# Tasks\n## TASK_1\nContent\n";
  assert.equal(validateOutput("jira-task", output2).valid, false);
});

// ===== handleValidationFailure Tests =====

test("validation failure writes .invalid.md and preserves canonical", async () => {
  await withTempDir(async (tempDir) => {
    const versionDir = path.join(tempDir, "v1");
    await mkdir(versionDir, { recursive: true });

    const canonical = path.join(versionDir, "architecture.md");
    await writeFile(canonical, "ORIGINAL CANONICAL CONTENT", "utf8");

    const invalidPath = await handleValidationFailure(
      "architecture",
      "BAD OUTPUT CONTENT",
      versionDir,
      "Missing headings",
    );

    const canonicalContent = await readFile(canonical, "utf8");
    const invalidContent = await readFile(invalidPath, "utf8");

    // Canonical must be unchanged
    assert.equal(canonicalContent, "ORIGINAL CANONICAL CONTENT");
    // Invalid file contains bad output
    assert.equal(invalidContent, "BAD OUTPUT CONTENT");
    // Invalid file is separate from canonical
    assert.notEqual(invalidPath, canonical);
  });
});

test("handleValidationFailure creates .invalid.md file", async () => {
  await withTempDir(async (tempDir) => {
    const versionDir = path.join(tempDir, "v1");
    await mkdir(versionDir, { recursive: true });

    const invalidPath = await handleValidationFailure(
      "requirements",
      "INVALID CONTENT",
      versionDir,
      "Missing section",
    );

    assert.ok(invalidPath.includes(".invalid.md"));
  });
});

test("handleValidationFailure overwrites existing .invalid.md", async () => {
  await withTempDir(async (tempDir) => {
    const versionDir = path.join(tempDir, "v1");
    await mkdir(versionDir, { recursive: true });

    // Write initial invalid file
    const invalidPath = await handleValidationFailure(
      "requirements",
      "FIRST INVALID RUN",
      versionDir,
      "Error 1",
    );

    // Run again with different content
    const invalidPath2 = await handleValidationFailure(
      "requirements",
      "SECOND INVALID RUN",
      versionDir,
      "Error 2",
    );

    // Paths should be the same (file was overwritten)
    assert.equal(invalidPath, invalidPath2);

    const content = await readFile(invalidPath2, "utf8");
    assert.equal(content, "SECOND INVALID RUN");
  });
});

test("handleValidationFailure returns path to the invalid file", async () => {
  await withTempDir(async (tempDir) => {
    const versionDir = path.join(tempDir, "v1");
    await mkdir(versionDir, { recursive: true });

    const invalidPath = await handleValidationFailure(
      "architecture",
      "CONTENT",
      versionDir,
      "Error",
    );

    // Path should exist and be within versionDir
    assert.ok(invalidPath.includes(versionDir));
    assert.ok(invalidPath.includes("architecture"));
    assert.ok(invalidPath.includes(".invalid"));
  });
});

// ===== Integration: Full Validation Workflow =====

test("complete validation workflow: valid output passes, invalid output fails correctly", () => {
  const validRequirements = [
    "# Requirements",
    "## Feature Summary",
    "Summary goes here",
    "## Functional Requirements",
    "- Requirement 1",
    "## Non-Functional Requirements",
    "- NF Requirement",
    "## Constraints",
    "- Constraint",
    "## Assumptions",
    "- Assumption",
    "## Open Questions",
    "- Question",
  ].join("\n");

  const result1 = validateOutput("requirements", validRequirements);
  assert.equal(result1.valid, true);

  // Same content with one heading removed should fail
  const invalidRequirements = validRequirements
    .split("\n")
    .filter((line) => !line.includes("## Constraints"))
    .join("\n");

  const result2 = validateOutput("requirements", invalidRequirements);
  assert.equal(result2.valid, false);
  assert.ok(result2.error?.includes("Missing required headings"));
});
