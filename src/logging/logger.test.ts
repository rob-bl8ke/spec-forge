import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { logger } from "./logger";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-logger-test-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("logger writes structured command entry with required fields", async () => {
  await withTempDir(async (tempDir) => {
    await logger.startCommand({
      rootDir: tempDir,
      command: "run",
      project: "comm-service",
      feature: "campaign-retry",
      version: "v1",
      step: "architecture",
      provider: "copilot",
      logLevel: "info",
      writePromptFiles: false,
    });

    await logger.endCommand("success");

    const logDir = path.join(tempDir, ".logs");
    const files = await readdir(logDir);
    const jsonFile = files.find((file) => file.endsWith(".json") && file !== "command-runs.ndjson");
    assert.ok(jsonFile, "expected a per-run json file");

    const raw = await readFile(path.join(logDir, jsonFile as string), "utf8");
    const entry = JSON.parse(raw) as Record<string, unknown>;

    assert.equal(typeof entry.timestamp, "string");
    assert.equal(entry.command, "run");
    assert.equal(entry.project, "comm-service");
    assert.equal(entry.feature, "campaign-retry");
    assert.equal(entry.version, "v1");
    assert.equal(entry.step, "architecture");
    assert.equal(entry.provider, "copilot");
    assert.equal(typeof entry.durationMs, "number");
    assert.equal(entry.outcome, "success");
  });
});

test("writePromptFiles true writes prompt file alongside logs", async () => {
  await withTempDir(async (tempDir) => {
    await logger.startCommand({
      rootDir: tempDir,
      command: "run",
      logLevel: "info",
      writePromptFiles: true,
    });
    logger.setPrompt("# Prompt\nHello world");
    await logger.endCommand("success");

    const logDir = path.join(tempDir, ".logs");
    const files = await readdir(logDir);
    const promptFile = files.find((file) => file.endsWith(".prompt.md"));
    assert.ok(promptFile, "expected a .prompt.md file");

    const promptContent = await readFile(path.join(logDir, promptFile as string), "utf8");
    assert.equal(promptContent, "# Prompt\nHello world");
  });
});

test("debug logging produces extra stdout messages vs info", async () => {
  await withTempDir(async (tempDir) => {
    const captured: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      captured.push(String(message));
    };

    try {
      await logger.startCommand({
        rootDir: tempDir,
        command: "sync",
        logLevel: "info",
      });
      await logger.endCommand("success");
      const infoCount = captured.length;

      captured.length = 0;
      await logger.startCommand({
        rootDir: tempDir,
        command: "sync",
        logLevel: "debug",
      });
      await logger.endCommand("success");
      const debugCount = captured.length;

      assert.ok(debugCount > infoCount, "expected debug mode to produce more stdout output than info mode");
    } finally {
      console.log = originalLog;
    }
  });
});
