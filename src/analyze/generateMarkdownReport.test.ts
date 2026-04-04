import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AnalyzeChangeModel } from "./types";
import { generateMarkdownReport, renderMarkdownReport } from "./generateMarkdownReport";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-analyze-markdown-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function createModel(overrides: Partial<AnalyzeChangeModel> = {}): AnalyzeChangeModel {
  return {
    project: "comm-service",
    feature: "Campaign Retry",
    fromVersion: "v1",
    toVersion: "v2",
    summary: "Retry strategy changed and one task was added.",
    requirementsChanges: ["Added requirement for retry jitter."],
    architectureChanges: ["Added RetryScheduler component."],
    jiraTaskImpact: {
      unchanged: [{ taskId: "TASK-1", title: "Keep bounded retries" }],
      modified: [
        {
          taskId: "TASK-2",
          title: "Emit retry metrics",
          change: "Added status labels to metric dimensions.",
          recommendedJiraUpdate: "Update task description to include status labels.",
        },
      ],
      removed: [
        {
          taskId: "TASK-3",
          title: "Remove legacy retry path",
          reason: "Legacy path was already deleted in prior release.",
        },
      ],
      new: [
        {
          taskId: "TASK-4",
          title: "Add jitter algorithm",
          reason: "Jitter is now a requirement.",
          suggestedDescription: "Implement full jitter for exponential backoff.",
        },
      ],
    },
    taskPromptImpact: {
      changed: true,
      summary: "Task prompts now include jitter acceptance criteria.",
    },
    recommendedJiraActions: [
      "Create task ticket for TASK-4.",
      "Update existing task ticket for TASK-2.",
    ],
    ...overrides,
  };
}

test("renderMarkdownReport includes all required section headings from spec 15.2", () => {
  const markdown = renderMarkdownReport(createModel());

  const requiredHeadings = [
    "# Change Analysis: v1 -> v2",
    "## Summary",
    "## Requirements Changes",
    "## Architecture Changes",
    "## Jira Task Impact",
    "### Unchanged Tasks",
    "### Modified Tasks",
    "### Removed Tasks",
    "### New Tasks",
    "## Task Prompt Impact",
    "## Recommended Jira Actions",
  ];

  for (const heading of requiredHeadings) {
    assert.match(markdown, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("task subsections are populated correctly", () => {
  const markdown = renderMarkdownReport(createModel());

  assert.match(markdown, /### Unchanged Tasks[\s\S]*TASK-1: Keep bounded retries/);
  assert.match(markdown, /### Modified Tasks[\s\S]*TASK-2: Emit retry metrics/);
  assert.match(markdown, /### Removed Tasks[\s\S]*TASK-3: Remove legacy retry path/);
  assert.match(markdown, /### New Tasks[\s\S]*TASK-4: Add jitter algorithm/);
});

test("generateMarkdownReport writes to output/<project>/<feature>/analysis-<from>-<to>.md and prints path", async () => {
  await withTempDir(async (tempDir) => {
    const printed: string[] = [];
    const result = await generateMarkdownReport(
      {
        rootDir: tempDir,
        model: createModel(),
      },
      (line) => printed.push(line),
    );

    const expectedPath = path.join(
      tempDir,
      "output",
      "comm-service",
      "campaign-retry",
      "analysis-v1-v2.md",
    );

    assert.equal(result.outputPath, expectedPath);
    assert.deepEqual(printed, [expectedPath]);

    const content = await readFile(expectedPath, "utf8");
    assert.equal(content, result.markdown);
  });
});

test("existing markdown report is silently overwritten", async () => {
  await withTempDir(async (tempDir) => {
    const model = createModel();
    const outputPath = path.join(
      tempDir,
      "output",
      model.project,
      "campaign-retry",
      `analysis-${model.fromVersion}-${model.toVersion}.md`,
    );

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, "OLD CONTENT\n", "utf8");

    const result = await generateMarkdownReport(
      {
        rootDir: tempDir,
        model,
      },
      () => {},
    );

    const content = await readFile(outputPath, "utf8");
    assert.equal(result.outputPath, outputPath);
    assert.notEqual(content, "OLD CONTENT\n");
    assert.equal(content, result.markdown);
  });
});
