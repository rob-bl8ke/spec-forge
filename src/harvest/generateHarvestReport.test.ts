import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { ConfigContext } from "../config/types";
import { generateHarvestReport, validateHarvestReport } from "./generateHarvestReport";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-harvest-report-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function createContext(rootDir: string): ConfigContext {
  return {
    rootDir,
    globalConfig: {
      provider: { active: "copilot", timeoutMs: 120000 },
      logging: { level: "info", writePromptFiles: false },
    },
    resolvedProvider: "copilot",
    resolvedProject: {
      name: "comm-service",
      repoPath: path.join(rootDir, "repo"),
      provider: "copilot",
      providerTimeoutMs: 120000,
      logging: { level: "info", writePromptFiles: false },
    },
  };
}

const VALID_REPORT = `# Harvest Report

## Summary
Two reusable patterns were found.

## High-Value Findings
- Correlation logging middleware

## Candidate Skills Created
- correlation-logging

## Recommended Promotions
- correlation-logging`;

test("valid provider response writes report file and prints path", async () => {
  await withTempDir(async (tempDir) => {
    const promptPath = path.join(tempDir, "harvest-report.md");
    await writeFile(
      promptPath,
      "Project: {{project_name}}\n\nPattern findings:\n{{pattern_summaries}}",
      "utf8",
    );

    const printed: string[] = [];
    const result = await generateHarvestReport(
      {
        rootDir: tempDir,
        projectName: "comm-service",
        patterns: [
          {
            path: path.join(tempDir, "pattern-a.md"),
            content: "# Pattern Summary\n\n## Title\nCorrelation Logging",
          },
        ],
        context: createContext(tempDir),
        promptTemplatePath: promptPath,
      },
      async () => VALID_REPORT,
      (line) => printed.push(line),
      () => new Date("2026-04-04T10:15:00.000Z"),
    );

    const expectedPath = path.join(
      tempDir,
      "harvested",
      "reports",
      "comm-service-20260404T101500Z.md",
    );

    assert.equal(result.outputPath, expectedPath);
    assert.deepEqual(printed, [expectedPath]);
    assert.equal(await readFile(expectedPath, "utf8"), `${VALID_REPORT}\n`);
  });
});

test("report prompt is invoked once with concatenated pattern summaries", async () => {
  await withTempDir(async (tempDir) => {
    const promptPath = path.join(tempDir, "harvest-report.md");
    await writeFile(
      promptPath,
      "Project: {{project_name}}\n\nPattern findings:\n{{pattern_summaries}}",
      "utf8",
    );

    const prompts: string[] = [];
    await generateHarvestReport(
      {
        rootDir: tempDir,
        projectName: "comm-service",
        patterns: [
          {
            path: path.join(tempDir, "pattern-a.md"),
            content: "# Pattern Summary\n\n## Title\nA",
          },
          {
            path: path.join(tempDir, "pattern-b.md"),
            content: "# Pattern Summary\n\n## Title\nB",
          },
        ],
        context: createContext(tempDir),
        promptTemplatePath: promptPath,
      },
      async (prompt) => {
        prompts.push(prompt);
        return VALID_REPORT;
      },
      () => {},
      () => new Date("2026-04-04T10:15:00.000Z"),
    );

    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /Project: comm-service/);
    assert.match(prompts[0], /## Title\nA/);
    assert.match(prompts[0], /## Title\nB/);
  });
});

test("no patterns still generates a zero-findings report", async () => {
  await withTempDir(async (tempDir) => {
    const promptPath = path.join(tempDir, "harvest-report.md");
    await writeFile(
      promptPath,
      "Pattern findings:\n{{pattern_summaries}}",
      "utf8",
    );

    const prompts: string[] = [];
    const result = await generateHarvestReport(
      {
        rootDir: tempDir,
        projectName: "comm-service",
        patterns: [],
        context: createContext(tempDir),
        promptTemplatePath: promptPath,
      },
      async (prompt) => {
        prompts.push(prompt);
        return `# Harvest Report

## Summary
Zero findings.

## High-Value Findings
- None

## Candidate Skills Created
- None

## Recommended Promotions
- None`;
      },
      () => {},
      () => new Date("2026-04-04T10:15:00.000Z"),
    );

    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /No pattern summaries were found for this harvest run\./);
    assert.match(result.outputPath, /comm-service-20260404T101500Z\.md$/);
  });
});

test("invalid report output throws and does not write a file", async () => {
  await withTempDir(async (tempDir) => {
    const promptPath = path.join(tempDir, "harvest-report.md");
    await writeFile(promptPath, "{{pattern_summaries}}", "utf8");

    await assert.rejects(
      async () => generateHarvestReport(
        {
          rootDir: tempDir,
          projectName: "comm-service",
          patterns: [],
          context: createContext(tempDir),
          promptTemplatePath: promptPath,
        },
        async () => "# Harvest Report\n\n## Summary\nOnly summary",
        () => {},
        () => new Date("2026-04-04T10:15:00.000Z"),
      ),
      /Invalid harvest report: missing required section '## High-Value Findings'/,
    );
  });
});

test("validateHarvestReport enforces required sections", () => {
  assert.deepEqual(validateHarvestReport(VALID_REPORT), { valid: true });
  assert.deepEqual(validateHarvestReport("# Harvest Report"), {
    valid: false,
    error: "missing required section '## Summary'",
  });
});