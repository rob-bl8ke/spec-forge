import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { registerSyncCommand } from "../../src/commands/sync";
import { initializeCommandContext } from "../../src/config/context";
import { confirmService, type ConfirmService } from "../../src/utils/confirm";

const FIXTURE_ASSETS_ROOT = path.join(process.cwd(), "tests", "fixtures", "sync", "assets");

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-sync-int-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function setupConfigAndRepo(rootDir: string): Promise<{ repoDir: string }> {
  const repoDir = path.join(rootDir, "repo");
  await mkdir(repoDir, { recursive: true });

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
  await mkdir(projectsDir, { recursive: true });
  await writeFile(
    path.join(projectsDir, "comm-service.yaml"),
    [
      "name: comm-service",
      "repoPath: repo",
      "sync:",
      "  targetDir: .github/spec-forge",
      "  overwritePolicy: prompt",
      "assets:",
      "  skills:",
      "    - retry-policy",
      "  instructions:",
      "    - code-review",
      "  knowledge:",
      "    - service-ownership",
    ].join("\n") + "\n",
    "utf8",
  );

  return { repoDir };
}

async function copyFixtureAssets(rootDir: string): Promise<void> {
  const mappings: Array<{ type: "skills" | "instructions" | "knowledge"; id: string }> = [
    { type: "skills", id: "retry-policy" },
    { type: "instructions", id: "code-review" },
    { type: "knowledge", id: "service-ownership" },
  ];

  for (const entry of mappings) {
    const targetDir = path.join(rootDir, entry.type);
    await mkdir(targetDir, { recursive: true });
    const sourcePath = path.join(FIXTURE_ASSETS_ROOT, entry.type, `${entry.id}.md`);
    const content = await readFile(sourcePath, "utf8");
    await writeFile(path.join(targetDir, `${entry.id}.md`), content, "utf8");
  }
}

function overrideConfirmYesNo(mock: (prompt: string) => Promise<boolean>): () => void {
  const original = confirmService.confirmYesNo.bind(confirmService);
  (confirmService as unknown as ConfirmService).confirmYesNo = mock;
  return () => {
    (confirmService as unknown as ConfirmService).confirmYesNo = original;
  };
}

async function runSyncCommand(rootDir: string): Promise<string[]> {
  const output: string[] = [];
  const originalLog = console.log;

  console.log = (...args: unknown[]) => {
    output.push(args.map((arg) => String(arg)).join(" "));
  };

  try {
    await initializeCommandContext({
      commandName: "sync",
      args: ["comm-service"],
      options: {},
      cwd: rootDir,
    });

    const program = new Command();
    program.exitOverride();
    registerSyncCommand(program);

    await program.parseAsync(["sync", "comm-service"], {
      from: "user",
    });

    return output;
  } finally {
    console.log = originalLog;
  }
}

function targetPath(repoDir: string, type: string, id: string): string {
  return path.join(repoDir, ".github", "spec-forge", type, `${id}.md`);
}

test("CREATE preview shows CREATE and confirms file write with metadata header", async () => {
  await withTempDir(async (rootDir) => {
    const { repoDir } = await setupConfigAndRepo(rootDir);
    await copyFixtureAssets(rootDir);

    let prompts = 0;
    const restoreConfirm = overrideConfirmYesNo(async () => {
      prompts += 1;
      return true;
    });

    try {
      const lines = await runSyncCommand(rootDir);

      assert.ok(lines.some((line) => line.includes("CREATE") && line.includes("retry-policy.md")));
      assert.ok(lines.some((line) => line.includes("CREATE") && line.includes("code-review.md")));
      assert.ok(lines.some((line) => line.includes("CREATE") && line.includes("service-ownership.md")));
      assert.equal(prompts, 1);

      const skillTarget = targetPath(repoDir, "skills", "retry-policy");
      const content = await readFile(skillTarget, "utf8");
      assert.match(content, /<!-- SPEC-FORGE-SYNC/);
      assert.match(content, /source: spec-forge\/skills\/retry-policy\.md/);
      assert.match(content, /assetId: retry-policy/);
      assert.match(content, /assetType: skill/);
      assert.match(content, /project: comm-service/);
    } finally {
      restoreConfirm();
    }
  });
});

test("UPDATE preview shows UPDATE, diff is displayed, and file is overwritten on confirm", async () => {
  await withTempDir(async (rootDir) => {
    const { repoDir } = await setupConfigAndRepo(rootDir);
    await copyFixtureAssets(rootDir);

    // Pre-create one target with different content to trigger UPDATE.
    const updateTarget = targetPath(repoDir, "skills", "retry-policy");
    await mkdir(path.dirname(updateTarget), { recursive: true });
    await writeFile(
      updateTarget,
      [
        "<!-- SPEC-FORGE-SYNC",
        "source: spec-forge/skills/retry-policy.md",
        "assetId: retry-policy",
        "assetType: skill",
        "syncedAt: 2026-01-01T00:00:00.000Z",
        "project: comm-service",
        "-->",
        "# Retry Policy Skill",
        "OUTDATED CONTENT",
      ].join("\n"),
      "utf8",
    );

    const restoreConfirm = overrideConfirmYesNo(async () => true);
    try {
      const lines = await runSyncCommand(rootDir);

      assert.ok(lines.some((line) => line.includes("UPDATE") && line.includes("retry-policy.md")));
      assert.ok(lines.some((line) => line.includes("Diff:") && line.includes("retry-policy.md")));

      const content = await readFile(updateTarget, "utf8");
      assert.ok(!content.includes("OUTDATED CONTENT"));
      assert.ok(content.includes("Use bounded retries with exponential backoff."));
    } finally {
      restoreConfirm();
    }
  });
});

test("UNCHANGED preview shows UNCHANGED and all-unchanged run does not prompt", async () => {
  await withTempDir(async (rootDir) => {
    const { repoDir } = await setupConfigAndRepo(rootDir);
    await copyFixtureAssets(rootDir);

    // Pre-sync all files so they classify as UNCHANGED.
    const assets: Array<{ type: "skills" | "instructions" | "knowledge"; id: string; singular: string }> = [
      { type: "skills", id: "retry-policy", singular: "skill" },
      { type: "instructions", id: "code-review", singular: "instruction" },
      { type: "knowledge", id: "service-ownership", singular: "knowledge" },
    ];

    for (const asset of assets) {
      const src = await readFile(path.join(rootDir, asset.type, `${asset.id}.md`), "utf8");
      const target = targetPath(repoDir, asset.type, asset.id);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(
        target,
        [
          "<!-- SPEC-FORGE-SYNC",
          `source: spec-forge/${asset.type}/${asset.id}.md`,
          `assetId: ${asset.id}`,
          `assetType: ${asset.singular}`,
          "syncedAt: 2026-01-01T00:00:00.000Z",
          "project: comm-service",
          "-->",
          src.trimEnd(),
        ].join("\n") + "\n",
        "utf8",
      );
    }

    let prompts = 0;
    const restoreConfirm = overrideConfirmYesNo(async () => {
      prompts += 1;
      return true;
    });

    try {
      const before = await readFile(targetPath(repoDir, "skills", "retry-policy"), "utf8");
      const lines = await runSyncCommand(rootDir);
      const after = await readFile(targetPath(repoDir, "skills", "retry-policy"), "utf8");

      assert.ok(lines.some((line) => line.includes("UNCHANGED") && line.includes("retry-policy.md")));
      assert.ok(lines.some((line) => line.includes("UNCHANGED") && line.includes("code-review.md")));
      assert.ok(lines.some((line) => line.includes("UNCHANGED") && line.includes("service-ownership.md")));
      assert.equal(prompts, 0);
      assert.equal(before, after);
    } finally {
      restoreConfirm();
    }
  });
});

test("confirmation 'n' aborts and writes no files", async () => {
  await withTempDir(async (rootDir) => {
    const { repoDir } = await setupConfigAndRepo(rootDir);
    await copyFixtureAssets(rootDir);

    let prompts = 0;
    const restoreConfirm = overrideConfirmYesNo(async () => {
      prompts += 1;
      return false;
    });

    try {
      const lines = await runSyncCommand(rootDir);

      assert.equal(prompts, 1);
      assert.ok(lines.some((line) => line.includes("Sync aborted. No files were changed.")));

      await assert.rejects(async () => readFile(targetPath(repoDir, "skills", "retry-policy"), "utf8"));
      await assert.rejects(async () => readFile(targetPath(repoDir, "instructions", "code-review"), "utf8"));
      await assert.rejects(async () => readFile(targetPath(repoDir, "knowledge", "service-ownership"), "utf8"));
    } finally {
      restoreConfirm();
    }
  });
});
