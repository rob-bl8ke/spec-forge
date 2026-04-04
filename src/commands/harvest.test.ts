import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import type { ConfigContext } from "../config/types";
import { harvestCommandHandler } from "./harvest";

function createContext(rootDir: string): ConfigContext {
  return {
    rootDir,
    globalConfig: {
      provider: { active: "copilot", timeoutMs: 120000 },
      logging: { level: "info", writePromptFiles: false },
    },
    resolvedProvider: "copilot",
    resolvedProject: {
      name: "comm-service",
      repoPath: path.join(rootDir, "repo"),
      provider: "copilot",
      providerTimeoutMs: 120000,
      logging: { level: "info", writePromptFiles: false },
      harvest: {
        enabled: true,
        commitWindow: 7,
        excludeAuthors: ["dependabot[bot]"],
        includeExtensions: [".ts"],
        minChangedLines: 10,
        maxChangedLines: 400,
        probes: ["resilience", "logging"],
      },
    },
  };
}

test("harvest command orchestrates fetch, extract, candidate skills, and report generation", async () => {
  const rootDir = "/workspace";
  const context = createContext(rootDir);
  const callOrder: string[] = [];

  const result = await harvestCommandHandler(
    rootDir,
    "comm-service",
    context,
    () => {},
    {
      fetchEligibleCommits: async (repoPath, config) => {
        callOrder.push("fetch");
        assert.equal(repoPath, path.join(rootDir, "repo"));
        assert.deepEqual(config, {
          commitWindow: 7,
          excludeAuthors: ["dependabot[bot]"],
          includeExtensions: [".ts"],
          minChangedLines: 10,
          maxChangedLines: 400,
          probes: ["resilience", "logging"],
        });

        return [{
          sha: "abc12345",
          author: "Rob",
          message: "Add correlation logging",
          changedFiles: ["src/log.ts"],
          changedLines: 42,
          diffText: "+ correlation id",
        }];
      },
      extractPatterns: async (input, _invokeProvider, print) => {
        callOrder.push("extract");
        assert.equal(input.rootDir, rootDir);
        assert.equal(input.projectName, "comm-service");
        assert.equal(input.probeName, "resilience, logging");
        assert.equal(input.commits.length, 1);
        print?.("pattern-log");
        return {
          writtenFiles: [path.join(rootDir, "harvested", "patterns", "comm-service-20260404T101500Z-correlation.md")],
          skippedNone: 0,
          invalid: 0,
          providerFailures: 0,
          deduplicated: 0,
        };
      },
      readPatternFile: async (filePath) => {
        callOrder.push("read-pattern");
        assert.match(filePath, /correlation\.md$/);
        return "# Pattern Summary\n\n## Title\nCorrelation Logging";
      },
      generateCandidateSkills: async (input, _invokeProvider, print) => {
        callOrder.push("candidate-skills");
        assert.equal(input.patterns.length, 1);
        assert.equal(input.patterns[0].content, "# Pattern Summary\n\n## Title\nCorrelation Logging");
        print?.("candidate-log");
        return {
          writtenFiles: [path.join(rootDir, "harvested", "candidate-skills", "correlation-logging.md")],
          invalid: 0,
          providerFailures: 0,
        };
      },
      generateHarvestReport: async (input, _invokeProvider, print) => {
        callOrder.push("report");
        assert.equal(input.projectName, "comm-service");
        assert.equal(input.patterns.length, 1);
        assert.equal(input.patterns[0].path, path.join(rootDir, "harvested", "patterns", "comm-service-20260404T101500Z-correlation.md"));
        print?.("report-log");
        return {
          outputPath: path.join(rootDir, "harvested", "reports", "comm-service-20260404T101500Z.md"),
        };
      },
    },
  );

  assert.deepEqual(callOrder, ["fetch", "extract", "read-pattern", "candidate-skills", "report"]);
  assert.equal(result.commits.length, 1);
  assert.equal(result.patterns.length, 1);
  assert.equal(result.candidateResult.writtenFiles.length, 1);
});

test("harvest command still generates report when no patterns are extracted", async () => {
  const rootDir = "/workspace";
  const context = createContext(rootDir);

  const result = await harvestCommandHandler(
    rootDir,
    "comm-service",
    context,
    () => {},
    {
      fetchEligibleCommits: async () => [],
      extractPatterns: async () => ({
        writtenFiles: [],
        skippedNone: 0,
        invalid: 0,
        providerFailures: 0,
        deduplicated: 0,
      }),
      readPatternFile: async () => {
        throw new Error("should not read patterns when none were written");
      },
      generateCandidateSkills: async (input) => {
        assert.equal(input.patterns.length, 0);
        return {
          writtenFiles: [],
          invalid: 0,
          providerFailures: 0,
        };
      },
      generateHarvestReport: async (input) => {
        assert.equal(input.patterns.length, 0);
        return {
          outputPath: path.join(rootDir, "harvested", "reports", "comm-service-20260404T101500Z.md"),
        };
      },
    },
  );

  assert.equal(result.patterns.length, 0);
  assert.match(result.reportResult.outputPath, /comm-service-20260404T101500Z\.md$/);
});

test("harvest command rejects when harvest is disabled", async () => {
  const rootDir = "/workspace";
  const context = createContext(rootDir);
  context.resolvedProject!.harvest!.enabled = false;

  await assert.rejects(
    async () => harvestCommandHandler(rootDir, "comm-service", context, () => {}),
    /Harvest is disabled for project 'comm-service'\./,
  );
});