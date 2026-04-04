import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { assembleArtifactContext } from "./assembleArtifactContext";

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-artifacts-test-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("two referenced artifacts produce one shared context block with separators", async () => {
  await withTempDir(async (tempDir) => {
    await mkdir(tempDir, { recursive: true });
    await writeFile(path.join(tempDir, "requirements.md"), "# Requirements\nReq body\n", "utf8");
    await writeFile(path.join(tempDir, "architecture.md"), "# Architecture\nArch body\n", "utf8");

    const block = await assembleArtifactContext(["requirements", "architecture"], tempDir);

    assert.equal(
      block,
      "--- CONTEXT: ARTIFACTS ---\n# requirements\n# Requirements\nReq body\n---\n# architecture\n# Architecture\nArch body\n---\n",
    );
  });
});

test("missing referenced artifact fails with named error", async () => {
  await withTempDir(async (tempDir) => {
    await writeFile(path.join(tempDir, "requirements.md"), "ok\n", "utf8");

    await assert.rejects(
      async () => assembleArtifactContext(["requirements", "architecture"], tempDir),
      /Missing required artifact 'architecture'/,
    );
  });
});

test("step with no inputs produces no context block", async () => {
  await withTempDir(async (tempDir) => {
    const block = await assembleArtifactContext(undefined, tempDir);
    assert.equal(block, undefined);
  });
});
