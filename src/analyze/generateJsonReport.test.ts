import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AnalyzeChangeModel } from "./types";
import { generateJsonReport, serializeAnalyzeModel } from "./generateJsonReport";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-analyze-json-"));
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

test("serializeAnalyzeModel has all required fields from spec 15.3", () => {
  const json = serializeAnalyzeModel(createModel());

  const requiredFields = [
    "project",
    "feature",
    "fromVersion",
    "toVersion",
    "summary",
    "requirementsChanges",
    "architectureChanges",
    "jiraTaskImpact",
    "taskPromptImpact",
    "recommendedJiraActions",
  ];

  for (const field of requiredFields) {
    assert.ok(field in json, `Field ${field} should be present`);
  }
});

test("jiraTaskImpact has correct structure with all subsections", () => {
  const json = serializeAnalyzeModel(createModel());
  const impact = (json as { jiraTaskImpact: unknown }).jiraTaskImpact as {
    unchanged?: unknown;
    modified?: unknown;
    removed?: unknown;
    new?: unknown;
  };

  assert.ok("unchanged" in impact);
  assert.ok("modified" in impact);
  assert.ok("removed" in impact);
  assert.ok("new" in impact);
});

test("taskPromptImpact has changed (boolean) and summary (string)", () => {
  const json = serializeAnalyzeModel(createModel());
  const promptImpact = (json as { taskPromptImpact: unknown }).taskPromptImpact as {
    changed?: unknown;
    summary?: unknown;
  };

  assert.equal(typeof promptImpact.changed, "boolean");
  assert.equal(typeof promptImpact.summary, "string");
});

test("all task arrays are populated correctly", () => {
  const json = serializeAnalyzeModel(createModel());
  const impact = (json as { jiraTaskImpact: unknown }).jiraTaskImpact as {
    unchanged: Array<{ taskId: string; title: string }>;
    modified: Array<{ taskId: string; title: string }>;
    removed: Array<{ taskId: string; title: string }>;
    new: Array<{ taskId: string; title: string }>;
  };

  assert.equal(impact.unchanged.length, 1);
  assert.equal(impact.unchanged[0].taskId, "TASK-1");
  assert.equal(impact.modified.length, 1);
  assert.equal(impact.modified[0].taskId, "TASK-2");
  assert.equal(impact.removed.length, 1);
  assert.equal(impact.removed[0].taskId, "TASK-3");
  assert.equal(impact.new.length, 1);
  assert.equal(impact.new[0].taskId, "TASK-4");
});

test("generateJsonReport writes to output/<project>/<feature>/analysis-<from>-<to>.json and prints path", async () => {
  await withTempDir(async (tempDir) => {
    const printed: string[] = [];
    const result = await generateJsonReport(
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
      "analysis-v1-v2.json",
    );

    assert.equal(result.outputPath, expectedPath);
    assert.deepEqual(printed, [expectedPath]);

    const content = await readFile(expectedPath, "utf8");
    const json = JSON.parse(content);
    assert.deepEqual(json, result.json);
  });
});

test("existing JSON report is silently overwritten", async () => {
  await withTempDir(async (tempDir) => {
    const model = createModel();
    const outputPath = path.join(
      tempDir,
      "output",
      model.project,
      "campaign-retry",
      `analysis-${model.fromVersion}-${model.toVersion}.json`,
    );

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, '{"old": "content"}\n', "utf8");

    const result = await generateJsonReport(
      {
        rootDir: tempDir,
        model,
      },
      () => {},
    );

    const content = await readFile(outputPath, "utf8");
    const json = JSON.parse(content);
    assert.equal(result.outputPath, outputPath);
    assert.deepEqual(json, result.json);
  });
});

test("overwrite logs message when file exists", async () => {
  await withTempDir(async (tempDir) => {
    const model = createModel();
    const outputPath = path.join(
      tempDir,
      "output",
      model.project,
      "campaign-retry",
      `analysis-${model.fromVersion}-${model.toVersion}.json`,
    );

    // Create initial file
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, '{"old": "content"}\n', "utf8");

    // Run report generation on existing file
    const logged: string[] = [];
    await generateJsonReport(
      {
        rootDir: tempDir,
        model,
      },
      () => {},
      (line) => logged.push(line),
    );

    // Should log overwrite message
    assert.deepEqual(logged, [
      "[analyze-change] Silently overwrote analysis-v1-v2.json",
    ]);
  });
});

test("no log message when writing new file", async () => {
  await withTempDir(async (tempDir) => {
    const model = createModel();

    const logged: string[] = [];
    await generateJsonReport(
      {
        rootDir: tempDir,
        model,
      },
      () => {},
      (line) => logged.push(line),
    );

    // Should not log anything for new file
    assert.deepEqual(logged, []);
  });
});
