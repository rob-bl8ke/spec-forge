import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { getCommandContext } from "../config/context";
import type { ConfigContext } from "../config/types";
import { fetchEligibleCommits, type EligibleCommit, type HarvestFilterConfig } from "../harvest/fetchEligibleCommits";
import { extractPatterns, type ExtractPatternsResult } from "../harvest/extractPatterns";
import { generateCandidateSkills, type CandidateSkillPattern, type GenerateCandidateSkillsResult } from "../harvest/generateCandidateSkills";
import { generateHarvestReport, type GenerateHarvestReportResult, type HarvestReportPattern } from "../harvest/generateHarvestReport";

export interface HarvestCommandResult {
  commits: EligibleCommit[];
  patterns: HarvestReportPattern[];
  extractResult: ExtractPatternsResult;
  candidateResult: GenerateCandidateSkillsResult;
  reportResult: GenerateHarvestReportResult;
}

export interface HarvestCommandDeps {
  fetchEligibleCommits: typeof fetchEligibleCommits;
  extractPatterns: typeof extractPatterns;
  generateCandidateSkills: typeof generateCandidateSkills;
  generateHarvestReport: typeof generateHarvestReport;
  readPatternFile: (filePath: string) => Promise<string>;
}

const defaultDeps: HarvestCommandDeps = {
  fetchEligibleCommits,
  extractPatterns,
  generateCandidateSkills,
  generateHarvestReport,
  readPatternFile: (filePath: string) => readFile(filePath, "utf8"),
};

function getHarvestFilterConfig(context: ConfigContext): HarvestFilterConfig {
  const harvest = context.resolvedProject?.harvest;
  return {
    commitWindow: harvest?.commitWindow ?? 30,
    excludeAuthors: harvest?.excludeAuthors ?? [],
    includeExtensions: harvest?.includeExtensions ?? [],
    minChangedLines: harvest?.minChangedLines ?? 0,
    maxChangedLines: harvest?.maxChangedLines ?? Number.MAX_SAFE_INTEGER,
    probes: harvest?.probes ?? [],
  };
}

function getProbeName(context: ConfigContext): string {
  const probes = context.resolvedProject?.harvest?.probes ?? [];
  return probes.length > 0 ? probes.join(", ") : "none";
}

async function loadPatternSummaries(
  writtenFiles: string[],
  readPatternFile: (filePath: string) => Promise<string>,
): Promise<HarvestReportPattern[]> {
  const patterns: HarvestReportPattern[] = [];
  for (const filePath of writtenFiles) {
    patterns.push({
      path: filePath,
      content: await readPatternFile(filePath),
    });
  }

  return patterns;
}

export async function harvestCommandHandler(
  rootDir: string,
  projectName: string,
  context: ConfigContext,
  print: (line: string) => void = console.log,
  deps: HarvestCommandDeps = defaultDeps,
): Promise<HarvestCommandResult> {
  if (!context.resolvedProject) {
    throw new Error(`Project configuration not loaded for '${projectName}'.`);
  }

  if (context.resolvedProject.harvest?.enabled === false) {
    throw new Error(`Harvest is disabled for project '${projectName}'.`);
  }

  const commits = await deps.fetchEligibleCommits(
    context.resolvedProject.repoPath,
    getHarvestFilterConfig(context),
  );

  const extractResult = await deps.extractPatterns(
    {
      rootDir,
      projectName,
      probeName: getProbeName(context),
      commits: commits.map((commit) => ({
        sha: commit.sha,
        message: commit.message,
        diffText: commit.diffText,
      })),
      context,
    },
    undefined,
    print,
  );

  const patterns = await loadPatternSummaries(extractResult.writtenFiles, deps.readPatternFile);

  const candidateResult = await deps.generateCandidateSkills(
    {
      rootDir,
      patterns: patterns.map((pattern): CandidateSkillPattern => ({
        path: pattern.path,
        content: pattern.content,
      })),
      context,
    },
    undefined,
    print,
  );

  const reportResult = await deps.generateHarvestReport(
    {
      rootDir,
      projectName,
      patterns,
      context,
    },
    undefined,
    print,
  );

  return {
    commits,
    patterns,
    extractResult,
    candidateResult,
    reportResult,
  };
}

export function registerHarvestCommand(program: Command): void {
  program
    .command("harvest")
    .argument("<project-name>", "Project name")
    .description("Harvest engineering patterns from git history")
    .action(async (projectName: string) => {
      const context = getCommandContext();
      await harvestCommandHandler(context.rootDir, projectName, context);
    });
}
