import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { initializeCommandContext } from "../../src/config/context";
import { registerPromoteCommand } from "../../src/commands/promote";
import { confirmService, type ConfirmService } from "../../src/utils/confirm";

const VALID_FIXTURE = path.join(process.cwd(), "tests", "fixtures", "promote", "valid-candidate.md");
const INVALID_FIXTURE = path.join(process.cwd(), "tests", "fixtures", "promote", "invalid-candidate.md");

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-promote-int-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function overrideConfirmYesNo(mock: (prompt: string) => Promise<boolean>): () => void {
  const original = confirmService.confirmYesNo.bind(confirmService);
  (confirmService as unknown as ConfirmService).confirmYesNo = mock;
  return () => {
    (confirmService as unknown as ConfirmService).confirmYesNo = original;
  };
}

async function setupBaseConfig(rootDir: string): Promise<void> {
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
}

async function runPromoteCommand(rootDir: string, candidateId: string): Promise<string[]> {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };

  try {
    await initializeCommandContext({
      commandName: "promote",
      args: [candidateId],
      options: {},
      cwd: rootDir,
    });

    const program = new Command();
    program.exitOverride();
    registerPromoteCommand(program);

    await program.parseAsync(["promote", candidateId], { from: "user" });
  } finally {
    console.log = originalLog;
  }

  return lines;
}

test("promote integration: valid candidate copied to skills directory", async () => {
  await withTempDir(async (tempDir) => {
    await setupBaseConfig(tempDir);

    const candidateDir = path.join(tempDir, "harvested", "candidate-skills");
    await mkdir(candidateDir, { recursive: true });
    await writeFile(
      path.join(candidateDir, "retry-guidance.md"),
      await readFile(VALID_FIXTURE, "utf8"),
      "utf8",
    );

    const restoreConfirm = overrideConfirmYesNo(async () => true);
    try {
      const lines = await runPromoteCommand(tempDir, "retry-guidance");

      assert.ok(lines.some((line) => line.includes("Promoted: retry-guidance")));

      const promotedPath = path.join(tempDir, "skills", "retry-guidance.md");
      const promotedContent = await readFile(promotedPath, "utf8");
      assert.match(promotedContent, /# Description/);
      assert.match(promotedContent, /# Guidance/);
      assert.match(promotedContent, /# Examples/);
    } finally {
      restoreConfirm();
    }
  });
});

test("promote integration: invalid candidate is rejected with named missing-section error", async () => {
  await withTempDir(async (tempDir) => {
    await setupBaseConfig(tempDir);

    const candidateDir = path.join(tempDir, "harvested", "candidate-skills");
    await mkdir(candidateDir, { recursive: true });
    await writeFile(
      path.join(candidateDir, "retry-guidance-invalid.md"),
      await readFile(INVALID_FIXTURE, "utf8"),
      "utf8",
    );

    const previousExitCode = process.exitCode;
    process.exitCode = 0;
    try {
      const lines = await runPromoteCommand(tempDir, "retry-guidance-invalid");

      assert.ok(lines.some((line) => line.includes("missing required section '# Examples'")));
      assert.equal(process.exitCode, 1);

      const promotedPath = path.join(tempDir, "skills", "retry-guidance-invalid.md");
      await assert.rejects(async () => readFile(promotedPath, "utf8"));
    } finally {
      process.exitCode = previousExitCode;
    }
  });
});
