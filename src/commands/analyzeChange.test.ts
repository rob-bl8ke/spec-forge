import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-analyze-change-test-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function getFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath, "utf8");
  // Simple hash: just count chars and lines (not cryptographic, just for change detection)
  return `${content.length}:${(content.match(/\n/g) || []).length}`;
}

test("analyze-change pipeline does not modify version folder artifacts", async () => {
  await withTempDir(async (tempDir) => {
    // Set up version folders with canonical artifacts
    const v1Dir = path.join(tempDir, "output", "comm-service", "campaign-retry", "v1");
    const v2Dir = path.join(tempDir, "output", "comm-service", "campaign-retry", "v2");

    await mkdir(v1Dir, { recursive: true });
    await mkdir(v2Dir, { recursive: true });

    // Create v1 artifacts
    const v1ReqPath = path.join(v1Dir, "requirements.md");
    const v1ArchPath = path.join(v1Dir, "architecture.md");
    const v1TaskPath = path.join(v1Dir, "jira-task.md");
    const v1PromptPath = path.join(v1Dir, "task-prompt.md");

    await writeFile(v1ReqPath, "# Requirements\n- Retry feature\n", "utf8");
    await writeFile(v1ArchPath, "# Architecture\n- Retry component\n", "utf8");
    await writeFile(v1TaskPath, "# Tasks\n## TASK-1: Add retry\n", "utf8");
    await writeFile(v1PromptPath, "# Task Prompts\n## TASK-1\nPrompt text\n", "utf8");

    // Create v2 artifacts with minor changes
    const v2ReqPath = path.join(v2Dir, "requirements.md");
    const v2ArchPath = path.join(v2Dir, "architecture.md");
    const v2TaskPath = path.join(v2Dir, "jira-task.md");
    const v2PromptPath = path.join(v2Dir, "task-prompt.md");

    await writeFile(v2ReqPath, "# Requirements\n- Retry feature\n- Jitter support\n", "utf8");
    await writeFile(v2ArchPath, "# Architecture\n- Retry component\n- Scheduler component\n", "utf8");
    await writeFile(v2TaskPath, "# Tasks\n## TASK-1: Add retry\n## TASK-2: Add jitter\n", "utf8");
    await writeFile(v2PromptPath, "# Task Prompts\n## TASK-1\nPrompt text\n## TASK-2\nJitter prompt\n", "utf8");

    // Capture hashes of version folder files before analyze-change
    const hashes = {
      v1Req: await getFileHash(v1ReqPath),
      v1Arch: await getFileHash(v1ArchPath),
      v1Task: await getFileHash(v1TaskPath),
      v1Prompt: await getFileHash(v1PromptPath),
      v2Req: await getFileHash(v2ReqPath),
      v2Arch: await getFileHash(v2ArchPath),
      v2Task: await getFileHash(v2TaskPath),
      v2Prompt: await getFileHash(v2PromptPath),
    };

    // Import and run analyze-change pipeline
    const { loadVersionArtifacts } = await import("../analyze/loadVersionArtifacts");
    const { classifyChanges } = await import("../analyze/classifyChanges");
    const { generateMarkdownReport } = await import("../analyze/generateMarkdownReport");
    const { generateJsonReport } = await import("../analyze/generateJsonReport");

    // Load version artifacts (read-only operation)
    const loadedArtifacts = await loadVersionArtifacts({
      rootDir: tempDir,
      project: "comm-service",
      feature: "campaign-retry",
      fromVersion: "v1",
      toVersion: "v2",
    });

    // Transform loaded artifacts to expected format
    let requirements: { from: string; to: string } | undefined;
    let architecture: { from: string; to: string } | undefined;
    let jiraTask: { from: string; to: string } | undefined;
    let taskPrompt: { from: string; to: string } | undefined;

    for (const pair of loadedArtifacts.pairs) {
      switch (pair.fileName) {
        case "requirements.md":
          requirements = { from: pair.fromContent, to: pair.toContent };
          break;
        case "architecture.md":
          architecture = { from: pair.fromContent, to: pair.toContent };
          break;
        case "jira-task.md":
          jiraTask = { from: pair.fromContent, to: pair.toContent };
          break;
        case "task-prompt.md":
          taskPrompt = { from: pair.fromContent, to: pair.toContent };
          break;
      }
    }

    if (!requirements || !architecture || !jiraTask || !taskPrompt) {
      throw new Error("Missing required artifact");
    }

    // Classify changes
    const changeModel = classifyChanges({
      project: "comm-service",
      feature: "campaign-retry",
      fromVersion: "v1",
      toVersion: "v2",
      artifacts: {
        requirements,
        architecture,
        jiraTask,
        taskPrompt,
      },
    });

    // Generate reports
    await generateMarkdownReport({
      rootDir: tempDir,
      model: changeModel,
    });

    await generateJsonReport({
      rootDir: tempDir,
      model: changeModel,
    });

    // Verify version folder artifacts are unchanged
    assert.equal(await getFileHash(v1ReqPath), hashes.v1Req, "v1 requirements modified");
    assert.equal(await getFileHash(v1ArchPath), hashes.v1Arch, "v1 architecture modified");
    assert.equal(await getFileHash(v1TaskPath), hashes.v1Task, "v1 tasks modified");
    assert.equal(await getFileHash(v1PromptPath), hashes.v1Prompt, "v1 prompts modified");
    assert.equal(await getFileHash(v2ReqPath), hashes.v2Req, "v2 requirements modified");
    assert.equal(await getFileHash(v2ArchPath), hashes.v2Arch, "v2 architecture modified");
    assert.equal(await getFileHash(v2TaskPath), hashes.v2Task, "v2 tasks modified");
    assert.equal(await getFileHash(v2PromptPath), hashes.v2Prompt, "v2 prompts modified");

    // Verify analysis output files were created at feature level
    const analysisMarkdownPath = path.join(
      tempDir,
      "output",
      "comm-service",
      "campaign-retry",
      "analysis-v1-v2.md",
    );
    const analysisJsonPath = path.join(
      tempDir,
      "output",
      "comm-service",
      "campaign-retry",
      "analysis-v1-v2.json",
    );

    const markdownContent = await readFile(analysisMarkdownPath, "utf8");
    const jsonContent = await readFile(analysisJsonPath, "utf8");

    assert.ok(markdownContent.length > 0, "Markdown report not created");
    assert.ok(jsonContent.length > 0, "JSON report not created");
  });
});
