import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

const BUILT_IN_PROBES: Record<string, string[]> = {
  resilience: ["retry", "backoff", "timeout", "circuit", "idempotent"],
  auth: ["jwt", "oauth", "authentication", "authorization", "security"],
  logging: ["log", "mdc", "correlation", "trace"],
};

export interface HarvestFilterConfig {
  commitWindow: number;
  excludeAuthors?: string[];
  includeExtensions?: string[];
  minChangedLines?: number;
  maxChangedLines?: number;
  probes?: string[];
}

export interface EligibleCommit {
  sha: string;
  author: string;
  message: string;
  changedFiles: string[];
  changedLines: number;
  diffText: string;
}

export type GitRunner = (repoPath: string, args: string[]) => Promise<string>;

interface CommitDetails {
  author: string;
  message: string;
  changedFiles: string[];
  changedLines: number;
  diffText: string;
}

async function defaultGitRunner(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args], {
    maxBuffer: 1024 * 1024 * 8,
    windowsHide: true,
  });
  return stdout;
}

function parseNumStat(output: string): { changedFiles: string[]; changedLines: number } {
  const changedFiles: string[] = [];
  let changedLines = 0;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const parts = rawLine.split("\t");
    if (parts.length < 3) {
      continue;
    }

    const added = parts[0] === "-" ? 0 : Number.parseInt(parts[0], 10);
    const deleted = parts[1] === "-" ? 0 : Number.parseInt(parts[1], 10);
    const filePath = parts.slice(2).join("\t");

    changedFiles.push(filePath);

    if (!Number.isNaN(added)) {
      changedLines += added;
    }
    if (!Number.isNaN(deleted)) {
      changedLines += deleted;
    }
  }

  return { changedFiles, changedLines };
}

function buildKeywordSet(activeProbes: string[] = []): string[] {
  const keywords = new Set<string>();
  for (const probe of activeProbes) {
    for (const keyword of BUILT_IN_PROBES[probe] ?? []) {
      keywords.add(keyword.toLowerCase());
    }
  }
  return [...keywords];
}

function hasIncludedExtension(files: string[], includeExtensions: string[]): boolean {
  if (includeExtensions.length === 0) {
    return true;
  }

  const includeSet = new Set(includeExtensions.map((ext) => ext.toLowerCase()));
  return files.some((file) => includeSet.has(path.extname(file).toLowerCase()));
}

function matchesKeywords(text: string, keywords: string[]): boolean {
  if (keywords.length === 0) {
    return false;
  }

  const haystack = text.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

async function readCommitDetails(
  repoPath: string,
  sha: string,
  gitRunner: GitRunner,
): Promise<CommitDetails> {
  const metaOutput = await gitRunner(repoPath, ["show", "--no-patch", "--format=%an%x1f%B", sha]);
  const splitAt = metaOutput.indexOf("\u001f");
  const author = splitAt >= 0 ? metaOutput.slice(0, splitAt).trim() : "";
  const message = splitAt >= 0 ? metaOutput.slice(splitAt + 1).trim() : metaOutput.trim();

  const numStatOutput = await gitRunner(repoPath, ["show", "--numstat", "--format=", sha]);
  const { changedFiles, changedLines } = parseNumStat(numStatOutput);

  const diffText = await gitRunner(repoPath, ["show", "--no-color", "--format=", sha]);

  return {
    author,
    message,
    changedFiles,
    changedLines,
    diffText,
  };
}

function isExcludedAuthor(author: string, excluded: string[]): boolean {
  const authorLower = author.toLowerCase();
  return excluded.some((blocked) => blocked.toLowerCase() === authorLower);
}

/**
 * Fetches last N commits and filters down to eligible commit diffs.
 * All eligibility rules are ANDed together.
 */
export async function fetchEligibleCommits(
  repoPath: string,
  config: HarvestFilterConfig,
  gitRunner: GitRunner = defaultGitRunner,
): Promise<EligibleCommit[]> {
  const commitWindow = config.commitWindow;
  const excludedAuthors = config.excludeAuthors ?? [];
  const includeExtensions = config.includeExtensions ?? [];
  const minChangedLines = config.minChangedLines ?? 0;
  const maxChangedLines = config.maxChangedLines ?? Number.MAX_SAFE_INTEGER;
  const keywords = buildKeywordSet(config.probes ?? []);

  const logOutput = await gitRunner(repoPath, ["log", `-n${commitWindow}`, "--pretty=format:%H"]);
  const shas = logOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const eligible: EligibleCommit[] = [];

  for (const sha of shas) {
    const details = await readCommitDetails(repoPath, sha, gitRunner);

    if (isExcludedAuthor(details.author, excludedAuthors)) {
      continue;
    }

    if (!hasIncludedExtension(details.changedFiles, includeExtensions)) {
      continue;
    }

    if (details.changedLines < minChangedLines || details.changedLines > maxChangedLines) {
      continue;
    }

    if (!matchesKeywords(`${details.message}\n${details.diffText}`, keywords)) {
      continue;
    }

    eligible.push({
      sha,
      author: details.author,
      message: details.message,
      changedFiles: details.changedFiles,
      changedLines: details.changedLines,
      diffText: details.diffText,
    });
  }

  return eligible;
}
