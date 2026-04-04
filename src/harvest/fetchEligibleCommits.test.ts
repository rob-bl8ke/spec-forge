import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchEligibleCommits,
  type GitRunner,
  type HarvestFilterConfig,
} from "./fetchEligibleCommits";

interface MockCommit {
  sha: string;
  author: string;
  message: string;
  numstat: string;
  diff: string;
}

function createMockGitRunner(commits: MockCommit[]): GitRunner {
  return async (_repoPath: string, args: string[]): Promise<string> => {
    if (args[0] === "log") {
      return commits.map((c) => c.sha).join("\n");
    }

    if (args[0] === "show") {
      const sha = args[args.length - 1];
      const commit = commits.find((c) => c.sha === sha);
      if (!commit) {
        throw new Error(`Missing mock commit for ${sha}`);
      }

      if (args.includes("--no-patch")) {
        return `${commit.author}\u001f${commit.message}`;
      }

      if (args.includes("--numstat")) {
        return commit.numstat;
      }

      return commit.diff;
    }

    throw new Error(`Unhandled git args: ${args.join(" ")}`);
  };
}

function baseConfig(): HarvestFilterConfig {
  return {
    commitWindow: 30,
    excludeAuthors: ["dependabot[bot]"],
    includeExtensions: [".ts", ".js"],
    minChangedLines: 10,
    maxChangedLines: 400,
    probes: ["resilience", "auth", "logging"],
  };
}

test("commit from excluded author is filtered out", async () => {
  const commits: MockCommit[] = [
    {
      sha: "a1",
      author: "dependabot[bot]",
      message: "retry logic",
      numstat: "12\t2\tsrc/retry.ts",
      diff: "+retry with timeout",
    },
  ];

  const eligible = await fetchEligibleCommits("/repo", baseConfig(), createMockGitRunner(commits));
  assert.equal(eligible.length, 0);
});

test("commit with non-included extension is filtered out", async () => {
  const commits: MockCommit[] = [
    {
      sha: "a2",
      author: "alice",
      message: "authentication improvements",
      numstat: "30\t4\tweb/index.html",
      diff: "+authentication flow",
    },
  ];

  const eligible = await fetchEligibleCommits("/repo", baseConfig(), createMockGitRunner(commits));
  assert.equal(eligible.length, 0);
});

test("keyword matching is case-insensitive", async () => {
  const commits: MockCommit[] = [
    {
      sha: "a3",
      author: "alice",
      message: "Add ReTrY helper",
      numstat: "15\t1\tsrc/retry.ts",
      diff: "+const RETRY = true",
    },
  ];

  const eligible = await fetchEligibleCommits("/repo", baseConfig(), createMockGitRunner(commits));
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].sha, "a3");
});

test("commit below minChangedLines is excluded", async () => {
  const commits: MockCommit[] = [
    {
      sha: "a4",
      author: "alice",
      message: "add timeout",
      numstat: "3\t1\tsrc/retry.ts",
      diff: "+timeout",
    },
  ];

  const eligible = await fetchEligibleCommits("/repo", baseConfig(), createMockGitRunner(commits));
  assert.equal(eligible.length, 0);
});

test("returns eligible commits with full diff text and metadata", async () => {
  const commits: MockCommit[] = [
    {
      sha: "a5",
      author: "alice",
      message: "Improve correlation id logging",
      numstat: "20\t5\tsrc/logging.ts",
      diff: "diff --git a/src/logging.ts b/src/logging.ts\n+correlation id",
    },
  ];

  const eligible = await fetchEligibleCommits("/repo", baseConfig(), createMockGitRunner(commits));

  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].author, "alice");
  assert.equal(eligible[0].message, "Improve correlation id logging");
  assert.equal(eligible[0].changedLines, 25);
  assert.deepEqual(eligible[0].changedFiles, ["src/logging.ts"]);
  assert.ok(eligible[0].diffText.includes("diff --git"));
});

test("commitWindow controls number of commits fetched from log", async () => {
  const commits: MockCommit[] = [
    {
      sha: "a6",
      author: "alice",
      message: "retry",
      numstat: "20\t0\tsrc/retry.ts",
      diff: "+retry",
    },
  ];

  let capturedLogArg = "";
  const runner: GitRunner = async (_repoPath, args) => {
    if (args[0] === "log") {
      capturedLogArg = args[1];
      return commits.map((c) => c.sha).join("\n");
    }

    const sha = args[args.length - 1];
    const commit = commits.find((c) => c.sha === sha);
    if (!commit) {
      throw new Error("missing commit");
    }

    if (args.includes("--no-patch")) {
      return `${commit.author}\u001f${commit.message}`;
    }

    if (args.includes("--numstat")) {
      return commit.numstat;
    }

    return commit.diff;
  };

  await fetchEligibleCommits(
    "/repo",
    {
      ...baseConfig(),
      commitWindow: 7,
    },
    runner,
  );

  assert.equal(capturedLogArg, "-n7");
});

test("no keyword match excludes commit even when other filters pass", async () => {
  const commits: MockCommit[] = [
    {
      sha: "a7",
      author: "alice",
      message: "refactor utility",
      numstat: "20\t5\tsrc/util.ts",
      diff: "+general helper",
    },
  ];

  const eligible = await fetchEligibleCommits("/repo", baseConfig(), createMockGitRunner(commits));
  assert.equal(eligible.length, 0);
});

test("line-count upper bound excludes oversized commit", async () => {
  const commits: MockCommit[] = [
    {
      sha: "a8",
      author: "alice",
      message: "add auth tracing",
      numstat: "401\t10\tsrc/auth.ts",
      diff: "+jwt and trace updates",
    },
  ];

  const eligible = await fetchEligibleCommits("/repo", baseConfig(), createMockGitRunner(commits));
  assert.equal(eligible.length, 0);
});
