import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { loadWorkflow } from "../../src/workflow/loadWorkflow";
import { executeWorkflow } from "../../src/workflow/executeWorkflow";
import { executeStep } from "../../src/workflow/executeStep";
import type { ConfigContext } from "../../src/config/types";
import { registerProvider, clearProviderRegistry } from "../../src/providers/providerFactory";
import { confirmService, type ConfirmService } from "../../src/utils/confirm";
import { createQueuedMockProvider } from "../fixtures/provider/mockProvider";

const FIXTURE_ROOT = path.join(process.cwd(), "tests", "fixtures");

const VALID_REQUIREMENTS = [
  "# Requirements",
  "## Feature Summary",
  "A short summary.",
  "## Functional Requirements",
  "- Implement retry policy.",
  "## Non-Functional Requirements",
  "- Maintain low latency.",
  "## Constraints",
  "- No external queue dependency.",
  "## Assumptions",
  "- Existing retries are available.",
  "## Open Questions",
  "- Should jitter be configurable?",
].join("\n");

const VALID_ARCHITECTURE = [
  "# Architecture",
  "## Overview",
  "Architecture overview.",
  "## Components",
  "- API",
  "- Worker",
  "## Data Flow",
  "Data flow text.",
  "## Key Design Decisions",
  "Decision text.",
  "## Failure Handling",
  "Failure handling text.",
  "## Observability",
  "Observability text.",
  "## Risks and Trade-offs",
  "Risk text.",
].join("\n");

const VALID_JIRA_TASK = [
  "# Tasks",
  "## TASK-1: Implement retry policy",
  "Build bounded retries.",
].join("\n");

const INVALID_JIRA_TASK = [
  "# Tasks",
  "## Notes",
  "This is missing TASK-<number> headings.",
].join("\n");

const VALID_TASK_PROMPT = [
  "# Task Prompts",
  "## TASK-1",
  "Implement retry policy with tests.",
].join("\n");

async function withTempDir(run: (root: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-workflow-int-"));
  try {
    await run(tempDir);
  } finally {
    clearProviderRegistry();
    await rm(tempDir, { recursive: true, force: true });
  }
}

function createConfigContext(rootDir: string): ConfigContext {
  return {
    rootDir,
    globalConfig: {
      provider: {
        active: "copilot",
        timeoutMs: 10000,
      },
      logging: {
        level: "info",
        writePromptFiles: false,
      },
    },
    resolvedProvider: "copilot",
  };
}

async function setupFixtureWorkflow(tempRoot: string): Promise<void> {
  const workflowsDir = path.join(tempRoot, "workflows");
  await mkdir(workflowsDir, { recursive: true });

  // Required by loadWorkflow (findSpecForgeRoot)
  await writeFile(
    path.join(tempRoot, "config.yaml"),
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

  const workflowTemplate = await readFile(
    path.join(FIXTURE_ROOT, "workflows", "spec-to-tasks.yaml"),
    "utf8",
  );

  const reqPrompt = (await readFile(path.join(FIXTURE_ROOT, "prompts", "requirements.prompt.txt"), "utf8")).trim();
  const archPrompt = (await readFile(path.join(FIXTURE_ROOT, "prompts", "architecture.prompt.txt"), "utf8")).trim();
  const jiraPrompt = (await readFile(path.join(FIXTURE_ROOT, "prompts", "jira-task.prompt.txt"), "utf8")).trim();
  const taskPrompt = (await readFile(path.join(FIXTURE_ROOT, "prompts", "task-prompt.prompt.txt"), "utf8")).trim();

  const workflowYaml = workflowTemplate
    .replace("__REQ_PROMPT__", reqPrompt)
    .replace("__ARCH_PROMPT__", archPrompt)
    .replace("__JIRA_PROMPT__", jiraPrompt)
    .replace("__TASK_PROMPT__", taskPrompt);

  await writeFile(path.join(workflowsDir, "spec-to-tasks.yaml"), workflowYaml, "utf8");
}

function overrideConfirmService(mock: ConfirmService): () => void {
  const originalDiff = confirmService.showUnifiedDiff.bind(confirmService);
  const originalConfirm = confirmService.confirmYesNo.bind(confirmService);

  (confirmService as unknown as ConfirmService).showUnifiedDiff = mock.showUnifiedDiff;
  (confirmService as unknown as ConfirmService).confirmYesNo = mock.confirmYesNo;

  return () => {
    (confirmService as unknown as ConfirmService).showUnifiedDiff = originalDiff;
    (confirmService as unknown as ConfirmService).confirmYesNo = originalConfirm;
  };
}

test("full workflow happy path writes four canonical artifacts to v1", async () => {
  await withTempDir(async (tempRoot) => {
    await setupFixtureWorkflow(tempRoot);

    const { adapter } = createQueuedMockProvider([
      VALID_REQUIREMENTS,
      VALID_ARCHITECTURE,
      VALID_JIRA_TASK,
      VALID_TASK_PROMPT,
    ]);
    registerProvider(adapter);

    const workflow = await loadWorkflow("spec-to-tasks", tempRoot);
    const versionDir = path.join(tempRoot, "output", "comm-service", "campaign-retry", "v1");

    const result = await executeWorkflow(
      workflow.steps,
      versionDir,
      "v1",
      "comm-service",
      "campaign-retry",
      tempRoot,
      tempRoot,
      createConfigContext(tempRoot),
    );

    assert.equal(result.success, true);
    assert.equal(result.stepsExecuted, 4);

    await access(path.join(versionDir, "requirements.md"));
    await access(path.join(versionDir, "architecture.md"));
    await access(path.join(versionDir, "jira-task.md"));
    await access(path.join(versionDir, "task-prompt.md"));
  });
});

test("failure at jira-task writes .invalid.md, stops workflow, preserves prior artifacts", async () => {
  await withTempDir(async (tempRoot) => {
    await setupFixtureWorkflow(tempRoot);

    const { adapter } = createQueuedMockProvider([
      VALID_REQUIREMENTS,
      VALID_ARCHITECTURE,
      INVALID_JIRA_TASK,
      VALID_TASK_PROMPT,
    ]);
    registerProvider(adapter);

    const workflow = await loadWorkflow("spec-to-tasks", tempRoot);
    const versionDir = path.join(tempRoot, "output", "comm-service", "campaign-retry", "v1");

    const result = await executeWorkflow(
      workflow.steps,
      versionDir,
      "v1",
      "comm-service",
      "campaign-retry",
      tempRoot,
      tempRoot,
      createConfigContext(tempRoot),
    );

    assert.equal(result.success, false);
    assert.equal(result.stoppedAtStep, "jira-task");

    await access(path.join(versionDir, "requirements.md"));
    await access(path.join(versionDir, "architecture.md"));
    await access(path.join(versionDir, "jira-task.invalid.md"));

    await assert.rejects(async () => access(path.join(versionDir, "task-prompt.md")));
  });
});

test("rerun architecture writes architecture.new.md and prompts for confirmation", async () => {
  await withTempDir(async (tempRoot) => {
    await setupFixtureWorkflow(tempRoot);

    const versionDir = path.join(tempRoot, "output", "comm-service", "campaign-retry", "v1");
    await mkdir(versionDir, { recursive: true });

    const requirementsPath = path.join(versionDir, "requirements.md");
    const architecturePath = path.join(versionDir, "architecture.md");
    await writeFile(requirementsPath, VALID_REQUIREMENTS, "utf8");
    await writeFile(architecturePath, "# Architecture\n## Overview\nOLD\n", "utf8");

    const { adapter } = createQueuedMockProvider([VALID_ARCHITECTURE]);
    registerProvider(adapter);

    const workflow = await loadWorkflow("spec-to-tasks", tempRoot);
    const architectureStep = workflow.steps.find((step) => step.id === "architecture");
    assert.ok(architectureStep);

    let showedDiff = 0;
    let askedConfirm = 0;
    const restoreConfirm = overrideConfirmService({
      async showUnifiedDiff(): Promise<void> {
        showedDiff += 1;
      },
      async confirmYesNo(): Promise<boolean> {
        askedConfirm += 1;
        return false;
      },
    });

    try {
      const result = await executeStep(
        architectureStep,
        versionDir,
        "comm-service",
        "campaign-retry",
        "v1",
        tempRoot,
        false,
        {
          configContext: createConfigContext(tempRoot),
          stepArtifacts: {
            requirements: requirementsPath,
          },
          rootDir: tempRoot,
        },
      );

      assert.equal(result.success, true);
      assert.equal(showedDiff, 1);
      assert.equal(askedConfirm, 1);

      const canonical = await readFile(architecturePath, "utf8");
      assert.equal(canonical, "# Architecture\n## Overview\nOLD\n");

      await access(path.join(versionDir, "architecture.new.md"));
    } finally {
      restoreConfirm();
    }
  });
});

test("rerun confirmation 'y' replaces canonical and removes architecture.new.md", async () => {
  await withTempDir(async (tempRoot) => {
    await setupFixtureWorkflow(tempRoot);

    const versionDir = path.join(tempRoot, "output", "comm-service", "campaign-retry", "v1");
    await mkdir(versionDir, { recursive: true });

    const requirementsPath = path.join(versionDir, "requirements.md");
    const architecturePath = path.join(versionDir, "architecture.md");
    await writeFile(requirementsPath, VALID_REQUIREMENTS, "utf8");
    await writeFile(architecturePath, "# Architecture\n## Overview\nOLD\n", "utf8");

    const { adapter } = createQueuedMockProvider([VALID_ARCHITECTURE]);
    registerProvider(adapter);

    const workflow = await loadWorkflow("spec-to-tasks", tempRoot);
    const architectureStep = workflow.steps.find((step) => step.id === "architecture");
    assert.ok(architectureStep);

    const restoreConfirm = overrideConfirmService({
      async showUnifiedDiff(): Promise<void> {
        return;
      },
      async confirmYesNo(): Promise<boolean> {
        return true;
      },
    });

    try {
      const result = await executeStep(
        architectureStep,
        versionDir,
        "comm-service",
        "campaign-retry",
        "v1",
        tempRoot,
        false,
        {
          configContext: createConfigContext(tempRoot),
          stepArtifacts: {
            requirements: requirementsPath,
          },
          rootDir: tempRoot,
        },
      );

      assert.equal(result.success, true);

      const canonical = await readFile(architecturePath, "utf8");
      assert.equal(canonical, VALID_ARCHITECTURE);

      await assert.rejects(async () => access(path.join(versionDir, "architecture.new.md")));
    } finally {
      restoreConfirm();
    }
  });
});

test("rerun requirements step is rejected with expected error", async () => {
  await withTempDir(async (tempRoot) => {
    await setupFixtureWorkflow(tempRoot);

    const versionDir = path.join(tempRoot, "output", "comm-service", "campaign-retry", "v1");
    await mkdir(versionDir, { recursive: true });

    const requirementsPath = path.join(versionDir, "requirements.md");
    await writeFile(requirementsPath, VALID_REQUIREMENTS, "utf8");

    const { adapter } = createQueuedMockProvider([VALID_REQUIREMENTS]);
    registerProvider(adapter);

    const workflow = await loadWorkflow("spec-to-tasks", tempRoot);
    const requirementsStep = workflow.steps.find((step) => step.id === "requirements");
    assert.ok(requirementsStep);

    const result = await executeStep(
      requirementsStep,
      versionDir,
      "comm-service",
      "campaign-retry",
      "v1",
      tempRoot,
      false,
      {
        configContext: createConfigContext(tempRoot),
        stepArtifacts: {},
        rootDir: tempRoot,
      },
    );

    assert.equal(result.success, false);
    assert.match(
      result.errorMessage ?? "",
      /requirements cannot be rerun\. Start a new version with a full workflow run\./,
    );
  });
});
