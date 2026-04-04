import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { loadAssets } from "./loadAssets";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-load-assets-test-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("all three asset types load and format correctly", async () => {
  await withTempDir(async (tempDir) => {
    await mkdir(path.join(tempDir, "skills"), { recursive: true });
    await mkdir(path.join(tempDir, "instructions"), { recursive: true });
    await mkdir(path.join(tempDir, "knowledge"), { recursive: true });

    await writeFile(path.join(tempDir, "skills", "kafka-patterns.md"), "Skill body\n", "utf8");
    await writeFile(path.join(tempDir, "instructions", "baseline.md"), "Instruction body\n", "utf8");
    await writeFile(path.join(tempDir, "knowledge", "events.md"), "Knowledge body\n", "utf8");

    const loaded = await loadAssets(tempDir, {
      skills: ["kafka-patterns"],
      instructions: ["baseline"],
      knowledge: ["events"],
    });

    assert.match(loaded.instructionsSection ?? "", /--- INSTRUCTIONS ---/);
    assert.match(loaded.skillsSection ?? "", /--- SKILLS ---/);
    assert.match(loaded.knowledgeSection ?? "", /--- KNOWLEDGE ---/);
    assert.match(loaded.composed ?? "", /# baseline[\s\S]*---[\s\S]*# kafka-patterns[\s\S]*---[\s\S]*# events/s);
  });
});

test("missing skill file throws hard error naming expected path", async () => {
  await withTempDir(async (tempDir) => {
    await mkdir(path.join(tempDir, "skills"), { recursive: true });

    await assert.rejects(
      async () => loadAssets(tempDir, { skills: ["missing-skill"] }),
      /Missing asset file:.*skills.*missing-skill\.md/,
    );
  });
});

test("empty skills list omits SKILLS section", async () => {
  await withTempDir(async (tempDir) => {
    await mkdir(path.join(tempDir, "instructions"), { recursive: true });
    await writeFile(path.join(tempDir, "instructions", "baseline.md"), "Instruction body\n", "utf8");

    const loaded = await loadAssets(tempDir, {
      skills: [],
      instructions: ["baseline"],
      knowledge: [],
    });

    assert.equal(loaded.skillsSection, undefined);
    assert.ok((loaded.composed ?? "").includes("--- INSTRUCTIONS ---"));
    assert.equal((loaded.composed ?? "").includes("--- SKILLS ---"), false);
  });
});
