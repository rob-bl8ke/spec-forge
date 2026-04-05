# spec-forge

Local-first CLI for generating, refining, syncing, harvesting, and analyzing software delivery artifacts.

This README is a practical daily-use manual. It focuses on how you actually run spec-forge every day, not just command definitions.

## What You Use It For

spec-forge helps you do five recurring jobs:

1. Generate feature artifacts from requirements input
2. Rerun a specific step safely with diff review
3. Sync reusable assets into a repository with preview and confirmation
4. Harvest reusable engineering patterns from commit history
5. Analyze change impact between artifact versions

## Daily Command Cheat Sheet

| Daily goal | Command | When to use |
|---|---|---|
| Start a new feature version | spec-forge run spec-to-tasks --project <project> --feature <feature> | Beginning work on a feature or major revision |
| Refine one step in existing version | spec-forge run <step-id> --project <project> --feature <feature> --version vN | You only want to improve one artifact without creating a new version |
| Compare two versions before coding | spec-forge analyze-change <project> <feature> vN vN+1 | You need impact clarity before implementation starts |
| Sync shared assets into repo | spec-forge sync <project> | End of day or before opening PRs |
| Harvest reusable patterns | spec-forge harvest <project> | Weekly pattern mining from commit history |
| Promote strong harvested skill | spec-forge promote <candidate-skill-id> | Candidate skill is validated and worth reusing |
| Run unit and integration tests | npm test | Before commit or PR |
| Run provider smoke tests (manual) | npm run test:smoke | After provider CLI/setup or adapter changes |

Quick defaults:

- Full feature generation: run workflow ID (spec-to-tasks)
- Targeted refinement: run step ID with --version
- Automated pipelines: prefer npm run build and npm test, skip interactive and smoke flows by default

## One-Screen Daily Script

Use this as a fast daily template. Replace placeholder values before running.

```bash
# 0) Build and baseline validation
npm run build
npm test

# 1) Start or refresh feature artifacts (creates next version)
spec-forge run spec-to-tasks --project <project> --feature <feature>

# 2) Optional: refine one step in the current version (interactive diff + y/n)
spec-forge run architecture --project <project> --feature <feature> --version <vN>

# 3) Optional: compare versions before implementation changes
spec-forge analyze-change <project> <feature> <from-version> <to-version>

# 4) End-of-day: sync shared assets into target repository (preview + diff + one y/n)
spec-forge sync <project>

# 5) Weekly-only: pattern mining and skill promotion
spec-forge harvest <project>
spec-forge promote <candidate-skill-id>
```

Notes:

- Step reruns require --version and may prompt for replacement confirmation
- sync prompts once for all UPDATE changes
- analyze-change overwrites prior analysis files silently

## Quick Start

### 0) 5-Minute Onboarding

If you are new to spec-forge, run this path first.

1. Install dependencies and build:

```bash
npm install
npm run build
```

2. Create root config:

```yaml
provider:
  active: copilot
  timeoutMs: 120000

logging:
  level: info
  writePromptFiles: false
```

3. Initialize your first project:

```bash
spec-forge init comm-service --repo ../communication-service
```

4. Run your first full workflow:

```bash
spec-forge run spec-to-tasks --project comm-service --feature first-feature
```

5. Verify output exists:

- output/comm-service/first-feature/v1/requirements.md
- output/comm-service/first-feature/v1/architecture.md
- output/comm-service/first-feature/v1/jira-task.md
- output/comm-service/first-feature/v1/task-prompt.md

After this, follow the Daily Workflow sections below.

### 1) Install and Build

Use Node.js 18+ (recommended 20+).

From the project root:

```bash
npm install
npm run build
```

Optional global install for shell usage:

```bash
npm install -g .
```

If you do not install globally, run commands with:

```bash
node dist/index.js <command> ...
```

### 2) Create Root Config

Create config.yaml in the spec-forge root:

```yaml
provider:
  active: copilot
  timeoutMs: 120000

logging:
  level: info
  writePromptFiles: false
```

### 3) Initialize Project Config

```bash
spec-forge init comm-service --repo ../communication-service
```

This creates projects/comm-service.yaml.

### 4) Ensure Required Folders Exist

At minimum, keep these directories in your root:

- prompts/
- workflows/
- skills/
- instructions/
- knowledge/
- projects/
- output/
- harvested/

## Daily Workflow (Recommended)

### Role-Based Usage

Use the same commands differently depending on your role.

### Solo Developer

Recommended cadence:

1. Start feature with full workflow run
2. Rerun one step where quality is weak
3. Analyze vN to vN+1 before implementation starts
4. Sync assets when patterns are worth sharing

Starter command set:

```bash
spec-forge run spec-to-tasks --project comm-service --feature campaign-retry
spec-forge run architecture --project comm-service --feature campaign-retry --version v1
spec-forge analyze-change comm-service campaign-retry v1 v2
spec-forge sync comm-service
```

### Tech Lead / Architect

Recommended cadence:

1. Require analyze-change before moving from one version to another
2. Use sync to keep team-shared instructions/skills aligned in repos
3. Run harvest weekly and review candidate skills for promotion

Starter command set:

```bash
spec-forge analyze-change comm-service campaign-retry v2 v3
spec-forge sync comm-service
spec-forge harvest comm-service
spec-forge promote kafka-idempotent-consumer
```

### Multi-Repo Contributor

Recommended cadence:

1. Keep one project YAML per repo in projects/
2. Use the same workflow IDs and feature naming style across repos
3. Sync assets selectively per project to avoid unnecessary churn

Example:

```bash
spec-forge init payments --repo ../payments-service
spec-forge init comm-service --repo ../communication-service
spec-forge run spec-to-tasks --project payments --feature retry-policy
spec-forge sync payments
```

## Morning Loop: Start a Feature

Goal: create vN artifacts for a feature.

1. Run full workflow:

```bash
spec-forge run spec-to-tasks --project comm-service --feature campaign-retry
```

2. Confirm output folder:

- output/comm-service/campaign-retry/v1/ (or next version)
- requirements.md
- architecture.md
- jira-task.md
- task-prompt.md

3. Review artifacts and decide if a rerun is needed.

## Midday Loop: Refine One Step Safely

Goal: rerun one step in an existing version without losing current files.

Example rerun architecture inside v1:

```bash
spec-forge run architecture --project comm-service --feature campaign-retry --version v1
```

What happens:

1. New output is written to architecture.new.md
2. Unified diff is shown
3. Prompt asks: Replace architecture.md? (y/n)
4. If y: canonical file replaced, .new.md removed
5. If n: canonical stays, .new.md kept for later review

Important:

- requirements cannot be rerun inside an existing version
- step rerun uses existing version, no new version folder

## Afternoon Loop: Analyze Drift Before Changes

Goal: compare versions and produce both markdown + JSON impact reports.

```bash
spec-forge analyze-change comm-service campaign-retry v1 v2
```

Outputs:

- output/comm-service/campaign-retry/analysis-v1-v2.md
- output/comm-service/campaign-retry/analysis-v1-v2.json

Behavior:

- both files are always written together
- reruns silently overwrite prior analysis files
- versioned workflow artifacts remain untouched

## End-of-Day Loop: Sync Shared Assets to Repo

Goal: update .github/spec-forge assets in your code repository safely.

```bash
spec-forge sync comm-service
```

Flow:

1. Preview lines show CREATE, UPDATE, UNCHANGED
2. UPDATE entries show unified diff
3. Single prompt: Apply changes? (y/n)
4. y applies all pending changes
5. n aborts all writes

Synced files include metadata header at top for traceability.

## Weekly Loop: Harvest Patterns and Promote Skills

### Harvest

```bash
spec-forge harvest comm-service
```

Harvest pipeline:

1. Filters eligible commits
2. Extracts pattern summaries
3. Deduplicates by normalized title
4. Generates candidate skills
5. Writes harvest report

Output folders:

- harvested/patterns/
- harvested/candidate-skills/
- harvested/reports/

### Promote a Candidate Skill

```bash
spec-forge promote retry-guidance
```

Behavior:

- validates candidate schema/sections
- copies valid skill into skills/
- invalid candidate is rejected with clear error

## Command Reference (Practical)

### Initialize project

```bash
spec-forge init <project-name> --repo <path>
```

### Run workflow or step

```bash
spec-forge run <workflow-or-step> --project <project> [--feature <feature>] [--version <version>] [--input-file <path>]
```

Examples:

```bash
spec-forge run spec-to-tasks --project comm-service --feature campaign-retry
spec-forge run architecture --project comm-service --feature campaign-retry --version v1
```

### Sync assets

```bash
spec-forge sync <project-name>
```

### Harvest patterns

```bash
spec-forge harvest <project-name>
```

### Promote candidate skill

```bash
spec-forge promote <candidate-skill-id>
```

### Analyze version changes

```bash
spec-forge analyze-change <project> <feature> <from-version> <to-version>
```

## Smoke Tests for Provider CLIs

Smoke tests are environment checks and are not part of standard npm test.

Standard tests:

```bash
npm test
```

Smoke tests:

```bash
npm run test:smoke
npm run test:smoke:windows
npm run test:smoke:mac
```

Smoke behavior:

- skips with clear message when platform does not match
- skips with clear message when CLI is unavailable
- passes only when real adapter invocation returns valid ProviderResponse fields

## CI/CD Usage Guidance

spec-forge is local-first. Use CI for validation, not interactive authoring.

Safe in CI:

- npm run build
- npm test
- optional targeted command checks that do not require interactive prompts

Avoid in CI by default:

- spec-forge run <step> reruns that ask y/n replacement questions
- spec-forge sync when UPDATE changes require confirmation
- npm run test:smoke (environment/provider dependent)

Recommended automation policy:

1. CI validates code and tests only
2. Human runs generation/refinement locally
3. Human reviews diffs and commits generated artifacts intentionally

Minimal CI snippet:

```bash
npm ci
npm run build
npm test
```

## Typical Directory Map

```text
spec-forge/
  config.yaml
  workflows/
  prompts/
  skills/
  instructions/
  knowledge/
  projects/
  output/
  harvested/
  .logs/
```

## Troubleshooting

### "Could not find config.yaml by walking up"

You are running outside the spec-forge root tree.

Fix: run command from root or any child folder under root.

### "Project configuration not loaded" or "sync requires a project configuration"

Project file missing or project name mismatch.

Fix:

1. Confirm projects/<project>.yaml exists
2. Confirm command project argument matches file name
3. Re-run init if needed

### Provider unavailable

Adapter checks CLI availability first.

Fix:

1. Install and authenticate provider CLI
2. Re-run smoke test command
3. Confirm provider.active in config.yaml

### Step rerun fails due to missing version

Step reruns require explicit --version.

Fix:

```bash
spec-forge run architecture --project comm-service --feature campaign-retry --version v1
```

### Analyze-change missing required artifact

One of requirements.md, architecture.md, jira-task.md, task-prompt.md is missing in from/to version folders.

Fix: regenerate missing artifact in the relevant version.

## Daily Best Practices

1. Use full run for new feature revisions; use step rerun only for targeted refinements.
2. Keep feature names stable and readable to avoid output path churn.
3. Review diff carefully before accepting step-rerun replacement.
4. Use analyze-change before large edits to avoid hidden scope drift.
5. Run sync only after reviewing preview and UPDATE diffs.
6. Harvest weekly, not continuously, to keep candidate quality high.
7. Promote only candidates with clear reuse value and complete sections.
8. Run smoke tests after changing provider adapters or local CLI setup.

## Development Notes

Build and test:

```bash
npm run build
npm test
```

The project currently uses strict TypeScript and the Node test runner via tsx.
