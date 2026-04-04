import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { extractPatterns } from "./extractPatterns";
import type { ConfigContext } from "../config/types";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-extract-patterns-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function makeContext(rootDir: string): ConfigContext {
  return {
    rootDir,
    globalConfig: {
      provider: {
        active: "copilot",
        timeoutMs: 120000,
      },
      logging: {
        level: "info",
        writePromptFiles: false,
      },
    },
    resolvedProvider: "copilot",
  };
}

async function writePromptTemplate(rootDir: string): Promise<string> {
  const promptPath = path.join(rootDir, "prompts", "harvest", "pattern-extraction.md");
  await mkdir(path.dirname(promptPath), { recursive: true });
  await writeFile(
    promptPath,
    [
      "Project: {{project_name}}",
      "Probe: {{probe_name}}",
      "Diff:",
      "{{diff_input}}",
    ].join("\n"),
    "utf8",
  );
  return promptPath;
}

test("NONE response produces no file", async () => {
  await withTempDir(async (tempDir) => {
    const promptPath = await writePromptTemplate(tempDir);

    const result = await extractPatterns(
      {
        rootDir: tempDir,
        projectName: "comm-service",
        probeName: "resilience",
        commits: [
          {
            sha: "abc12345",
            message: "retry improvements",
            diffText: "+retry",
          },
        ],
        context: makeContext(tempDir),
        promptTemplatePath: promptPath,
      },
      async () => "NONE",
    );

    const files = await readdir(path.join(tempDir, "harvested", "patterns"));
    assert.equal(files.length, 0);
    assert.equal(result.skippedNone, 1);
    assert.equal(result.writtenFiles.length, 0);
  });
});

test("valid pattern response writes to harvested/patterns path", async () => {
  await withTempDir(async (tempDir) => {
    const promptPath = await writePromptTemplate(tempDir);

    const result = await extractPatterns(
      {
        rootDir: tempDir,
        projectName: "comm-service",
        probeName: "logging",
        commits: [
          {
            sha: "deadbeef",
            message: "logging correlation",
            diffText: "+correlation id",
          },
        ],
        context: makeContext(tempDir),
        promptTemplatePath: promptPath,
      },
      async () => [
        "# Pattern Summary",
        "",
        "## Title",
        "Correlation Logging",
        "",
        "## Category",
        "logging",
      ].join("\n"),
    );

    assert.equal(result.writtenFiles.length, 1);
    const written = result.writtenFiles[0];
    assert.ok(written.includes(path.join("harvested", "patterns")));
    assert.ok(path.basename(written).startsWith("comm-service-"));

    const content = await readFile(written, "utf8");
    assert.ok(content.includes("# Pattern Summary"));
    assert.ok(content.includes("## Title"));
  });
});

test("invalid non-NONE response is logged and skipped", async () => {
  await withTempDir(async (tempDir) => {
    const promptPath = await writePromptTemplate(tempDir);
    const lines: string[] = [];

    const result = await extractPatterns(
      {
        rootDir: tempDir,
        projectName: "comm-service",
        probeName: "auth",
        commits: [
          {
            sha: "beadfeed",
            message: "auth change",
            diffText: "+jwt",
          },
        ],
        context: makeContext(tempDir),
        promptTemplatePath: promptPath,
      },
      async () => "Some text but no required heading",
      (line) => lines.push(line),
    );

    assert.equal(result.invalid, 1);
    assert.equal(result.writtenFiles.length, 0);
    assert.ok(lines.some((line) => line.includes("missing '# Pattern Summary'")));
  });
});

test("provider failure is logged and processing continues", async () => {
  await withTempDir(async (tempDir) => {
    const promptPath = await writePromptTemplate(tempDir);
    const lines: string[] = [];
    let calls = 0;

    const result = await extractPatterns(
      {
        rootDir: tempDir,
        projectName: "comm-service",
        probeName: "resilience",
        commits: [
          {
            sha: "11111111",
            message: "first",
            diffText: "diff one",
          },
          {
            sha: "22222222",
            message: "second",
            diffText: "diff two",
          },
        ],
        context: makeContext(tempDir),
        promptTemplatePath: promptPath,
      },
      async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("provider down");
        }
        return [
          "# Pattern Summary",
          "",
          "## Title",
          "Retry Backoff",
          "",
          "## Category",
          "resilience",
        ].join("\n");
      },
      (line) => lines.push(line),
    );

    assert.equal(result.providerFailures, 1);
    assert.equal(result.writtenFiles.length, 1);
    assert.ok(lines.some((line) => line.includes("Pattern extraction failed for 11111111")));
  });
});

test("prompt variables are substituted for each commit", async () => {
  await withTempDir(async (tempDir) => {
    const promptPath = await writePromptTemplate(tempDir);
    const seenPrompts: string[] = [];

    await extractPatterns(
      {
        rootDir: tempDir,
        projectName: "comm-service",
        probeName: "logging",
        commits: [
          {
            sha: "99999999",
            message: "trace update",
            diffText: "+trace id",
          },
        ],
        context: makeContext(tempDir),
        promptTemplatePath: promptPath,
      },
      async (prompt) => {
        seenPrompts.push(prompt);
        return "NONE";
      },
    );

    assert.equal(seenPrompts.length, 1);
    assert.ok(seenPrompts[0].includes("Project: comm-service"));
    assert.ok(seenPrompts[0].includes("Probe: logging"));
    assert.ok(seenPrompts[0].includes("sha: 99999999"));
    assert.ok(seenPrompts[0].includes("trace update"));
  });
});
