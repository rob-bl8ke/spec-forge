import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { clearProviderRegistry, registerProvider } from "../../src/providers/providerFactory";
import type { ConfigContext } from "../../src/config/types";
import { fetchEligibleCommits, type GitRunner } from "../../src/harvest/fetchEligibleCommits";
import { extractPatterns } from "../../src/harvest/extractPatterns";
import { generateCandidateSkills } from "../../src/harvest/generateCandidateSkills";
import { generateHarvestReport } from "../../src/harvest/generateHarvestReport";
import { harvestCommandHandler } from "../../src/commands/harvest";
import { createQueuedMockProvider } from "../fixtures/provider/mockProvider";

const HARVEST_FIXTURE = path.join(process.cwd(), "tests", "fixtures", "harvest", "commits.json");

type FixtureCommit = {
  sha: string;
  author: string;
  message: string;
  changedFiles: string[];
  changedLines: number;
  diffText: string;
};

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec-forge-harvest-int-"));
  try {
    await run(tempDir);
  } finally {
    clearProviderRegistry();
    await rm(tempDir, { recursive: true, force: true });
  }
}

function createContext(rootDir: string, repoPath: string): ConfigContext {
  return {
    rootDir,
    globalConfig: {
      provider: { active: "copilot", timeoutMs: 120000 },
      logging: { level: "info", writePromptFiles: false },
    },
    projectConfig: {
      name: "comm-service",
      repoPath,
    },
    resolvedProvider: "copilot",
    resolvedProject: {
      name: "comm-service",
      repoPath,
      provider: "copilot",
      providerTimeoutMs: 120000,
      logging: { level: "info", writePromptFiles: false },
      harvest: {
        enabled: true,
        commitWindow: 10,
        excludeAuthors: ["dependabot[bot]"],
        includeExtensions: [".ts"],
        minChangedLines: 5,
        maxChangedLines: 500,
        probes: ["resilience"],
      },
    },
  };
}

function createGitRunner(commits: FixtureCommit[]): GitRunner {
  return async (_repoPath: string, args: string[]): Promise<string> => {
    if (args[0] === "log") {
      return commits.map((commit) => commit.sha).join("\n");
    }

    if (args[0] === "show" && args[1] === "--no-patch") {
      const sha = args[3];
      const commit = commits.find((item) => item.sha === sha);
      if (!commit) {
        return "";
      }
      return `${commit.author}\u001f${commit.message}`;
    }

    if (args[0] === "show" && args[1] === "--numstat") {
      const sha = args[3];
      const commit = commits.find((item) => item.sha === sha);
      if (!commit) {
        return "";
      }
      const perFileLines = Math.max(1, Math.floor(commit.changedLines / commit.changedFiles.length));
      return commit.changedFiles
        .map((filePath) => `${perFileLines}\t0\t${filePath}`)
        .join("\n");
    }

    if (args[0] === "show" && args[1] === "--no-color") {
      const sha = args[3];
      const commit = commits.find((item) => item.sha === sha);
      return commit?.diffText ?? "";
    }

    throw new Error(`Unexpected git args: ${args.join(" ")}`);
  };
}

async function setupPromptTemplates(rootDir: string): Promise<void> {
  const promptDir = path.join(rootDir, "prompts", "harvest");
  await mkdir(promptDir, { recursive: true });

  await writeFile(
    path.join(promptDir, "pattern-extraction.md"),
    "Project: {{project_name}}\nProbe: {{probe_name}}\n{{diff_input}}\n",
    "utf8",
  );

  await writeFile(
    path.join(promptDir, "candidate-skill.md"),
    "Use pattern:\n{{pattern_summary}}\n",
    "utf8",
  );

  await writeFile(
    path.join(promptDir, "harvest-report.md"),
    "Project: {{project_name}}\n{{pattern_summaries}}\n",
    "utf8",
  );
}

test("harvest integration: eligible commit extracted, duplicate deduped, candidate and report written", async () => {
  await withTempDir(async (tempDir) => {
    const repoPath = path.join(tempDir, "repo");
    await mkdir(repoPath, { recursive: true });
    await setupPromptTemplates(tempDir);

    const commits = JSON.parse(await readFile(HARVEST_FIXTURE, "utf8")) as FixtureCommit[];
    const gitRunner = createGitRunner(commits);

    const { adapter } = createQueuedMockProvider([
      [
        "# Pattern Summary",
        "## Title",
        "Resilient Retry Strategy",
        "Use bounded retries with backoff.",
      ].join("\n"),
      [
        "# Pattern Summary",
        "## Title",
        "Resilient Retry Strategy",
        "Same title should dedupe.",
      ].join("\n"),
      [
        "---",
        "id: resilient-retry-skill",
        "type: skill",
        "version: \"1.0\"",
        "source: harvested",
        "confidence: high",
        "---",
        "# Description",
        "Retry strategy guidance.",
        "",
        "# Guidance",
        "Use bounded retries with jitter.",
        "",
        "# Examples",
        "- Retry network calls up to three times.",
      ].join("\n"),
      [
        "# Harvest Report",
        "## Summary",
        "One high-value retry pattern extracted.",
        "## High-Value Findings",
        "- Resilient Retry Strategy",
        "## Candidate Skills Created",
        "- resilient-retry-skill",
        "## Recommended Promotions",
        "- promote resilient-retry-skill",
      ].join("\n"),
    ]);
    registerProvider(adapter);

    const context = createContext(tempDir, repoPath);

    const result = await harvestCommandHandler(
      tempDir,
      "comm-service",
      context,
      () => {},
      {
        fetchEligibleCommits: (repo, cfg) => fetchEligibleCommits(repo, cfg, gitRunner),
        extractPatterns,
        generateCandidateSkills,
        generateHarvestReport,
        readPatternFile: (filePath) => readFile(filePath, "utf8"),
      },
    );

    // excluded author filtered out => only 2 eligible
    assert.equal(result.commits.length, 2);
    assert.ok(!result.commits.some((commit) => commit.author === "dependabot[bot]"));

    // first eligible commit produced pattern file; duplicate discarded
    assert.equal(result.extractResult.writtenFiles.length, 1);
    assert.equal(result.extractResult.deduplicated, 1);

    const patternContent = await readFile(result.extractResult.writtenFiles[0], "utf8");
    assert.match(patternContent, /# Pattern Summary/);
    assert.match(patternContent, /Resilient Retry Strategy/);

    // candidate skill generated
    assert.equal(result.candidateResult.writtenFiles.length, 1);
    const candidatePath = result.candidateResult.writtenFiles[0];
    const candidateContent = await readFile(candidatePath, "utf8");
    assert.match(candidateContent, /id: resilient-retry-skill/);

    // report generated
    const reportContent = await readFile(result.reportResult.outputPath, "utf8");
    assert.match(reportContent, /# Harvest Report/);
    assert.match(reportContent, /## Summary/);
  });
});
