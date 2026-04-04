import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { generateCandidateSkills, validateCandidateSkill } from "./generateCandidateSkills";
import type { ConfigContext } from "../config/types";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-candidate-skills-"));
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
      provider: { active: "copilot", timeoutMs: 120000 },
      logging: { level: "info", writePromptFiles: false },
    },
    resolvedProvider: "copilot",
  };
}

async function writePromptTemplate(rootDir: string): Promise<string> {
  const promptPath = path.join(rootDir, "prompts", "harvest", "candidate-skill.md");
  await mkdir(path.dirname(promptPath), { recursive: true });
  await writeFile(promptPath, "Pattern summary:\n{{pattern_summary}}\n", "utf8");
  return promptPath;
}

function validResponse(id = "retry-backoff"): string {
  return [
    "---",
    `id: ${id}`,
    "type: skill",
    "version: 0.1.0",
    "source: harvested",
    "confidence: medium",
    "tags:",
    "  - resilience",
    "references:",
    "  - commit:abc123",
    "---",
    "",
    "# Description",
    "Short explanation.",
    "",
    "# Guidance",
    "- Do this",
    "",
    "# Examples",
    "- Example",
  ].join("\n");
}

test("valid provider response writes correct file", async () => {
  await withTempDir(async (tempDir) => {
    const promptPath = await writePromptTemplate(tempDir);

    const result = await generateCandidateSkills(
      {
        rootDir: tempDir,
        patterns: [{ path: "pattern-a.md", content: "# Pattern Summary\n\n## Title\nRetry Backoff" }],
        context: makeContext(tempDir),
        promptTemplatePath: promptPath,
      },
      async () => validResponse("retry-backoff"),
    );

    assert.equal(result.invalid, 0);
    assert.equal(result.writtenFiles.length, 1);
    const content = await readFile(result.writtenFiles[0], "utf8");
    assert.ok(content.includes("id: retry-backoff"));
    assert.ok(result.writtenFiles[0].endsWith(path.join("candidate-skills", "retry-backoff.md")));
  });
});

test("missing id frontmatter field fails validation and produces no file", async () => {
  const response = validResponse().replace(/^id: retry-backoff\n/m, "");
  const validation = validateCandidateSkill(response);
  assert.equal(validation.valid, false);
  assert.match(validation.error ?? "", /missing required frontmatter field 'id'/);
});

test("invalid confidence value fails validation", async () => {
  const response = validResponse().replace("confidence: medium", "confidence: certain");
  const validation = validateCandidateSkill(response);
  assert.equal(validation.valid, false);
  assert.match(validation.error ?? "", /confidence/);
});

test("missing sections fails validation", async () => {
  const response = validResponse().replace("# Examples\n- Example", "");
  const validation = validateCandidateSkill(response);
  assert.equal(validation.valid, false);
  assert.match(validation.error ?? "", /missing required sections/);
});

test("invalid response is logged and skipped", async () => {
  await withTempDir(async (tempDir) => {
    const promptPath = await writePromptTemplate(tempDir);
    const lines: string[] = [];

    const result = await generateCandidateSkills(
      {
        rootDir: tempDir,
        patterns: [{ path: "pattern-a.md", content: "# Pattern Summary" }],
        context: makeContext(tempDir),
        promptTemplatePath: promptPath,
      },
      async () => "# not a valid candidate skill",
      (line) => lines.push(line),
    );

    assert.equal(result.invalid, 1);
    assert.equal(result.writtenFiles.length, 0);
    assert.ok(lines.some((line) => line.includes("Invalid candidate skill for pattern-a.md")));
  });
});

test("provider failures are logged and skipped", async () => {
  await withTempDir(async (tempDir) => {
    const promptPath = await writePromptTemplate(tempDir);
    const lines: string[] = [];

    const result = await generateCandidateSkills(
      {
        rootDir: tempDir,
        patterns: [{ path: "pattern-a.md", content: "# Pattern Summary" }],
        context: makeContext(tempDir),
        promptTemplatePath: promptPath,
      },
      async () => {
        throw new Error("provider unavailable");
      },
      (line) => lines.push(line),
    );

    assert.equal(result.providerFailures, 1);
    assert.equal(result.writtenFiles.length, 0);
    assert.ok(lines.some((line) => line.includes("Candidate skill generation failed for pattern-a.md")));
  });
});
