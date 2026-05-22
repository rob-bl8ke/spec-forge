import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { initializeCommandContext } from "../../src/config/context";
import { registerAnalyzeChangeCommand } from "../../src/commands/analyzeChange";

const FIXTURE_ANALYZE_ROOT = path.join(process.cwd(), "tests", "fixtures", "analyze");

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-analyze-int-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function setupConfig(rootDir: string): Promise<void> {
  await writeFile(
    path.join(rootDir, "config.yaml"),
    [
      "provider:",
      "  active: copilot",
      "  timeoutMs: 120000",
      "logging:",
      "  level: info",
      "  writePromptFiles: false",
    ].join("\n") + "\n",
    "utf8",
  );

  const projectsDir = path.join(rootDir, "projects");
  const repoDir = path.join(rootDir, "repo");
  await mkdir(projectsDir, { recursive: true });
  await mkdir(repoDir, { recursive: true });

  await writeFile(
    path.join(projectsDir, "comm-service.yaml"),
    [
      "name: comm-service",
      "repoPath: ./repo",
      "sync:",
      "  overwritePolicy: prompt",
    ].join("\n") + "\n",
    "utf8",
  );
}

async function copyAnalyzeFixtures(rootDir: string): Promise<void> {
  const outputBase = path.join(rootDir, "output", "comm-service", "campaign-retry");
  const v1Dir = path.join(outputBase, "v1");
  const v2Dir = path.join(outputBase, "v2");
  await mkdir(v1Dir, { recursive: true });
  await mkdir(v2Dir, { recursive: true });

  const files = ["requirements.md", "architecture.md", "jira-task.md", "task-prompt.md"];
  for (const fileName of files) {
    const v1Content = await readFile(path.join(FIXTURE_ANALYZE_ROOT, "v1", fileName), "utf8");
    const v2Content = await readFile(path.join(FIXTURE_ANALYZE_ROOT, "v2", fileName), "utf8");
    await writeFile(path.join(v1Dir, fileName), v1Content, "utf8");
    await writeFile(path.join(v2Dir, fileName), v2Content, "utf8");
  }
}

async function runAnalyzeChange(rootDir: string): Promise<void> {
  await initializeCommandContext({
    commandName: "analyze-change",
    args: ["comm-service", "campaign-retry", "v1", "v2"],
    options: {},
    cwd: rootDir,
  });

  const program = new Command();
  program.exitOverride();
  registerAnalyzeChangeCommand(program);

  await program.parseAsync(
    ["analyze-change", "comm-service", "campaign-retry", "v1", "v2"],
    { from: "user" },
  );
}

async function fileDigest(filePath: string): Promise<string> {
  const content = await readFile(filePath, "utf8");
  return `${content.length}:${(content.match(/\n/g) ?? []).length}`;
}

test("analyze-change integration writes md/json outputs, overwrites on rerun, and preserves version artifacts", async () => {
  await withTempDir(async (tempDir) => {
    await setupConfig(tempDir);
    await copyAnalyzeFixtures(tempDir);

    const v1Req = path.join(tempDir, "output", "comm-service", "campaign-retry", "v1", "requirements.md");
    const v1Arch = path.join(tempDir, "output", "comm-service", "campaign-retry", "v1", "architecture.md");
    const v1Task = path.join(tempDir, "output", "comm-service", "campaign-retry", "v1", "jira-task.md");
    const v1Prompt = path.join(tempDir, "output", "comm-service", "campaign-retry", "v1", "task-prompt.md");
    const v2Req = path.join(tempDir, "output", "comm-service", "campaign-retry", "v2", "requirements.md");
    const v2Arch = path.join(tempDir, "output", "comm-service", "campaign-retry", "v2", "architecture.md");
    const v2Task = path.join(tempDir, "output", "comm-service", "campaign-retry", "v2", "jira-task.md");
    const v2Prompt = path.join(tempDir, "output", "comm-service", "campaign-retry", "v2", "task-prompt.md");

    const before = {
      v1Req: await fileDigest(v1Req),
      v1Arch: await fileDigest(v1Arch),
      v1Task: await fileDigest(v1Task),
      v1Prompt: await fileDigest(v1Prompt),
      v2Req: await fileDigest(v2Req),
      v2Arch: await fileDigest(v2Arch),
      v2Task: await fileDigest(v2Task),
      v2Prompt: await fileDigest(v2Prompt),
    };

    await runAnalyzeChange(tempDir);

    const analysisMd = path.join(tempDir, "output", "comm-service", "campaign-retry", "analysis-v1-v2.md");
    const analysisJson = path.join(tempDir, "output", "comm-service", "campaign-retry", "analysis-v1-v2.json");

    const firstMd = await readFile(analysisMd, "utf8");
    const firstJson = await readFile(analysisJson, "utf8");

    assert.match(firstMd, /# Change Analysis: v1 -> v2/);
    assert.match(firstJson, /"project": "comm-service"/);

    // Force overwrite check by replacing both files with sentinels.
    await writeFile(analysisMd, "SENTINEL_MD\n", "utf8");
    await writeFile(analysisJson, "{\"sentinel\": true}\n", "utf8");

    await runAnalyzeChange(tempDir);

    const secondMd = await readFile(analysisMd, "utf8");
    const secondJson = await readFile(analysisJson, "utf8");

    assert.notEqual(secondMd, "SENTINEL_MD\n");
    assert.notEqual(secondJson, "{\"sentinel\": true}\n");
    assert.match(secondMd, /## Jira Task Impact/);
    assert.match(secondJson, /"taskPromptImpact"/);

    // Workflow artifacts in v1/v2 remain untouched.
    assert.equal(await fileDigest(v1Req), before.v1Req);
    assert.equal(await fileDigest(v1Arch), before.v1Arch);
    assert.equal(await fileDigest(v1Task), before.v1Task);
    assert.equal(await fileDigest(v1Prompt), before.v1Prompt);
    assert.equal(await fileDigest(v2Req), before.v2Req);
    assert.equal(await fileDigest(v2Arch), before.v2Arch);
    assert.equal(await fileDigest(v2Task), before.v2Task);
    assert.equal(await fileDigest(v2Prompt), before.v2Prompt);
  });
});
