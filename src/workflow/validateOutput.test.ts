import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { handleValidationFailure, validateOutput } from "./validateOutput";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-validate-output-test-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("requirements artifact with all required headings passes", () => {
  const output = [
    "# Requirements",
    "## Feature Summary",
    "## Functional Requirements",
    "## Non-Functional Requirements",
    "## Constraints",
    "## Assumptions",
    "## Open Questions",
  ].join("\n");

  assert.equal(validateOutput("requirements", output).valid, true);
});

test("architecture artifact with all required headings passes", () => {
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

  assert.equal(validateOutput("architecture", output).valid, true);
});

test("jira-task validates root heading and task pattern", () => {
  const output = "# Tasks\n## TASK-1: Implement\n";
  assert.equal(validateOutput("jira-task", output).valid, true);
});

test("task-prompt validates root heading and task pattern", () => {
  const output = "# Task Prompts\n## TASK-1\n";
  assert.equal(validateOutput("task-prompt", output).valid, true);
});

test("missing required heading fails validation", () => {
  const output = "# Requirements\n## Feature Summary\n";
  const result = validateOutput("requirements", output);
  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /Missing required headings/);
});

test("jira-task without TASK headings fails", () => {
  const output = "# Tasks\n## Notes\n";
  const result = validateOutput("jira-task", output);
  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /Missing required TASK headings/);
});

test("jira-task still accepts legacy '# Jira Tasks' heading", () => {
  const output = "# Jira Tasks\n## TASK-1: Implement\n";
  assert.equal(validateOutput("jira-task", output).valid, true);
});

test("validation failure writes .invalid.md and does not overwrite canonical", async () => {
  await withTempDir(async (tempDir) => {
    const versionDir = path.join(tempDir, "v1");
    await mkdir(versionDir, { recursive: true });

    const canonical = path.join(versionDir, "architecture.md");
    await writeFile(canonical, "ORIGINAL", "utf8");

    const invalidPath = await handleValidationFailure(
      "architecture",
      "BAD OUTPUT",
      versionDir,
      "Missing headings",
    );

    const canonicalContent = await readFile(canonical, "utf8");
    const invalidContent = await readFile(invalidPath, "utf8");

    assert.equal(canonicalContent, "ORIGINAL");
    assert.equal(invalidContent, "BAD OUTPUT");
  });
});

test("rerun invalid output overwrites existing .invalid.md", async () => {
  await withTempDir(async (tempDir) => {
    const versionDir = path.join(tempDir, "v1");
    await mkdir(versionDir, { recursive: true });

    const invalidPath = path.join(versionDir, "architecture.invalid.md");
    await writeFile(invalidPath, "OLD INVALID", "utf8");

    await handleValidationFailure("architecture", "NEW INVALID", versionDir, "Missing headings");

    const content = await readFile(invalidPath, "utf8");
    assert.equal(content, "NEW INVALID");
  });
});
