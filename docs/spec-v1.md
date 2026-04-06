# Spec Forge MVP Technical Spec v0.5

This version locks all product and engineering decisions required to begin implementation. Contract gaps from v0.3 are fully resolved by v0.4 and v0.5 precision refinements, which are incorporated here.

## 1. Product name

**Authoritative name:** `spec-forge`

Use `spec-forge` consistently for:

* CLI command
* root folder names inside synced repos
* generated metadata
* documentation

Examples:

```bash
spec-forge run spec-to-tasks --project comm-service --feature campaign-retry
spec-forge sync comm-service
spec-forge harvest comm-service
```

---

# 2. MVP purpose

Spec Forge is a **local-first CLI system** for:

* generating and refining implementation artifacts from requirements
* syncing reusable AI assets into code repositories
* harvesting useful engineering patterns from teammate git activity
* analyzing change impact across spec versions before execution artifacts are updated manually

It is designed as a **single-user personal leverage tool** first.

---

# 3. MVP architecture

```text
spec-forge/
  config.yaml
  prompts/
  workflows/
  skills/
  instructions/
  knowledge/
  projects/
  harvested/
    patterns/
    candidate-skills/
    reports/
  output/
  .logs/
```

---

# 4. Authoritative MVP artifact model

For the `spec-to-tasks` workflow, the canonical artifacts are:

* `requirements.md`
* `architecture.md`
* `jira-task.md`
* `task-prompt.md`

These are the only authoritative output files for this workflow in MVP.

---

# 5. Version and folder naming contract

## 5.1 Output path format

```text
spec-forge/output/<project>/<feature>/<version>/
```

Example:

```text
spec-forge/output/comm-service/campaign-retry/v1/
spec-forge/output/comm-service/campaign-retry/v2/
```

## 5.2 Feature slugging rules

Feature names are converted to slugs with this policy:

* lowercase
* spaces become `-`
* underscores become `-`
* remove non-alphanumeric characters except `-`
* collapse repeated dashes

Examples:

* `Campaign Retry` → `campaign-retry`
* `IMS / Retry Fix` → `ims-retry-fix`

## 5.3 Version naming rules

* full workflow runs create a new version folder
* versions are sequential: `v1`, `v2`, `v3`
* single-step reruns do not create new versions
* single-step reruns operate within an existing version
* single-step reruns re-run only the specified step and its downstream dependents; upstream steps are not re-run

## 5.4 Rerun temp file rules

Single-step reruns write output to a `.new.md` file first:

```text
architecture.new.md
jira-task.new.md
```

Before replacing the canonical file, the system:

1. Displays a line-level unified diff between the current file and `.new.md`
2. Prompts: `Replace <filename>? (y/n)`

On `y`: canonical file is replaced, `.new.md` is deleted.
On `n`: `.new.md` is preserved, canonical file is untouched.

## 5.5 Overwrite policy summary

| Context | Behavior |
|---|---|
| Workflow artifact (new full run) | New version folder created; no overwrite |
| Workflow artifact (step rerun) | `.new.md` + diff + `y/n` confirmation |
| Sync target (CREATE) | Write directly |
| Sync target (UPDATE) | Diff shown + single `y/n` confirmation for all pending changes |
| Analyze-change `.md` and `.json` | Silent overwrite |
| `.invalid.md` files | Silent overwrite |
| Log files | Silent overwrite |

---

# 6. Provider adapter contract

## 6.1 Goals

* keep MVP provider abstraction small
* support one active provider at a time
* hide CLI differences behind one interface

## 6.2 Interface

```ts
interface ProviderAdapter {
  name: "copilot" | "claude";

  isAvailable(): Promise<boolean>;

  generate(request: ProviderRequest): Promise<ProviderResponse>;
}
```

## 6.3 Request contract

```ts
type ProviderRequest = {
  prompt: string;
  workingDirectory?: string;
  timeoutMs: number;
  model?: string;
};
```

## 6.4 Response contract

```ts
type ProviderResponse = {
  provider: "copilot" | "claude";
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
};
```

## 6.5 Success rule

A provider call is successful only if:

* process exits with code `0`
* not timed out
* `stdout` is not empty after trimming

Otherwise, the call is treated as failed.

## 6.6 Timeout rule

Default per-provider timeout:

```text
120000 ms
```

## 6.7 Retry rule

MVP retry policy:

* retry once only on process launch failure or non-timeout nonzero exit
* no retry on empty prompt
* no retry on unresolved variables
* no retry on timeout

## 6.8 Stderr handling

* stderr is logged
* stderr does not fail the call if exit code is 0 and stdout has content
* stderr is included in logs for troubleshooting

## 6.9 Working directory rule

If a project has a `repoPath`, provider commands are run with that as working directory by default.
This helps tools that rely on repo-local context.

## 6.10 Provider config

Global config example:

```yaml
provider:
  active: copilot
  timeoutMs: 120000
  model: gpt-4.1
```

Project config can override active provider and model:

```yaml
provider: claude
model: claude-opus-4-5
```

Project-level values win. Model resolution order: project `model` → global `provider.model` → adapter default.

## 6.11 MVP provider invocation behavior

The implementation should isolate exact shell commands into adapter classes so they can be changed without touching workflow logic.

The spec intentionally defines the contract, not the literal shell syntax, because CLI invocation details may vary by environment.
What is fixed is:

* prompt is passed as one string input to the provider adapter
* provider adapter returns plain text output
* Spec Forge does not depend on streaming

---

# 7. Config schemas

## 7.1 Global config

```yaml
provider:
  active: copilot
  timeoutMs: 120000
  model: gpt-4.1  # optional; adapter default used if omitted

logging:
  level: info
  writePromptFiles: true
```

## 7.2 Project config schema

```yaml
name: comm-service
repoPath: ../communication-service

provider: copilot
model: gpt-4.1  # optional; overrides global provider.model

workflowDefaults:
  defaultWorkflow: spec-to-tasks

assets:
  skills:
    - spring-boot-resilience
    - kafka-patterns
  instructions:
    - backend-service-baseline
  knowledge:
    - event-driven-guidelines

sync:
  targetDir: .github/spec-forge   # fallback base for all asset types
  targets:                          # optional per-type overrides
    skills: .github/prompts         # skills land here instead of targetDir
    instructions: .github           # instructions land here instead of targetDir
    # knowledge omitted → falls back to targetDir
  previewByDefault: true
  overwritePolicy: prompt

harvest:
  enabled: true
  commitWindow: 30
  excludeAuthors:
    - Robbie
  includeExtensions:
    - .java
    - .kt
    - .cs
    - .ts
  minChangedLines: 10
  maxChangedLines: 400
  probes:
    - resilience
    - auth
    - logging
```

## 7.3 Workflow schema

```yaml
id: spec-to-tasks
description: Generate requirements, architecture, Jira tasks, and technical task prompts

steps:
  - id: requirements
    prompt: prompts/spec-to-tasks/requirements.md
    output: requirements.md

  - id: architecture
    prompt: prompts/spec-to-tasks/architecture.md
    input: requirements
    output: architecture.md

  - id: jira-task
    prompt: prompts/spec-to-tasks/jira-task.md
    input:
      - requirements
      - architecture
    output: jira-task.md

  - id: task-prompt
    prompt: prompts/spec-to-tasks/task-prompt.md
    input:
      - requirements
      - architecture
      - jira-task
    output: task-prompt.md
```

## 7.4 Step execution semantics

* Steps execute in the order they are declared in the workflow YAML.
* Each step declares its inputs explicitly via the `input` field. There is no implicit dependency resolution.
* If a step's `input` references a step that has not run in the current execution context, the command fails before any provider call is made.
* Execution is fail-fast: if any step fails, the workflow stops immediately. No further steps run.
* Outputs from steps that completed successfully before the failure are preserved in the version folder.

## 7.5 `init` command contract

`spec-forge init <project-name> --repo <path>` creates a single project config file. It does not scaffold prompts, workflows, skills, instructions, or knowledge files.

Created file: `projects/<project-name>.yaml`

```yaml
name: <project-name>
repoPath: <repo-path>

provider: copilot

workflowDefaults:
  defaultWorkflow: spec-to-tasks

assets:
  skills: []
  instructions: []
  knowledge: []

sync:
  targetDir: .github/spec-forge
  previewByDefault: true
  overwritePolicy: prompt

harvest:
  minChangedLines: 10
  maxChangedLines: 400
  probes:
    - resilience
    - auth
    - logging
```

If `projects/<project-name>.yaml` already exists, the command fails with an error. It does not overwrite.

---

# 8. Prompt contract

## 8.1 Template syntax

MVP supports only:

```text
{{variable_name}}
```

No loops, no conditionals, no nested expressions.

## 8.2 Allowed variables

### Core runtime variables

* `{{user_input}}` — placed only where the template explicitly includes it; never appended globally to the final prompt
* `{{project_name}}`
* `{{feature_name}}`
* `{{feature_slug}}`
* `{{workflow_id}}`
* `{{step_id}}`

### Artifact variables

* `{{requirements}}`
* `{{architecture}}`
* `{{jira_task}}`
* `{{task_prompt}}`

### Asset variables

* `{{instructions}}`
* `{{skills}}`
* `{{knowledge}}`

## 8.3 Variable resolution rules

Step IDs map to output content:

* `requirements` → `{{requirements}}`
* `architecture` → `{{architecture}}`
* `jira-task` → `{{jira_task}}`
* `task-prompt` → `{{task_prompt}}`

## 8.4 Missing variable behavior

If a referenced variable cannot be resolved:

* command fails before provider invocation
* no partial prompt is sent
* error names the missing variable and file

## 8.5 Prompt composition order

The final prompt is assembled as:

1. Take the raw step prompt template
2. Substitute all `{{variable}}` placeholders with resolved values
3. If any assets (instructions, skills, knowledge) are attached to the project, append one shared artifact context block

### Final composed structure

```text
[step prompt with resolved variables]

--- CONTEXT: ARTIFACTS ---
# <asset-id>
[asset content]

---

# <asset-id>
[asset content]

---
```

### Composition rules

* Each asset is wrapped with `# <asset-id>` as a heading and followed by `\n---\n` as a separator.
* All assets — instructions, skills, and knowledge — are concatenated into the single `--- CONTEXT: ARTIFACTS ---` block in that order.
* If no assets are attached to the project, the `--- CONTEXT: ARTIFACTS ---` block is omitted entirely.
* `{{user_input}}` is placed only where it appears in the prompt template. It is never appended to the final prompt outside the template.

## 8.6 Asset resolution paths

Assets are resolved relative to the spec-forge root:

* `skills/<id>.md`
* `instructions/<id>.md`
* `knowledge/<id>.md`

Asset IDs in the project config are bare names without path or extension. The resolver appends `.md` and looks up the file in the matching folder. If a referenced asset file does not exist, the command fails before provider invocation.

---

# 9. Exact `spec-to-tasks` prompt files

These are first-pass authoritative prompt contracts.

## 9.1 `prompts/spec-to-tasks/requirements.md`

```md
You are a senior software architect helping define a feature clearly before implementation.

Project: {{project_name}}
Feature: {{feature_name}}

User input:
{{user_input}}

Produce a concise but implementation-useful requirements document.

Output requirements:
- Use markdown
- Be concrete, not generic
- Avoid filler language
- Call out assumptions explicitly
- Include only details relevant to building the feature

Structure your response exactly as:

# Requirements

## Feature Summary
A short explanation of the feature and its purpose.

## Functional Requirements
- Bullet list of concrete capabilities the system must provide

## Non-Functional Requirements
- Bullet list covering reliability, performance, observability, security, maintainability, or operational needs if relevant

## Constraints
- Bullet list of technical, organizational, or platform constraints

## Assumptions
- Bullet list of assumptions that may need confirmation

## Open Questions
- Bullet list of unresolved questions, or say `None` if there are none
```

## 9.2 `prompts/spec-to-tasks/architecture.md`

```md
You are a senior backend architect.

Project: {{project_name}}
Feature: {{feature_name}}

Use the requirements below to design a practical implementation architecture.

Requirements:
{{requirements}}

Produce a technical architecture document that is concrete enough to drive task breakdown.

Output requirements:
- Use markdown
- Be specific and implementation-oriented
- Include failure handling where relevant
- Include trade-offs where relevant
- Do not repeat the requirements verbatim
- Prefer pragmatic architecture over theoretical perfection

Structure your response exactly as:

# Architecture

## Overview
A short summary of the proposed design.

## Components
- Bullet list of major components or modules involved

## Data Flow
- Step-by-step description of how the feature works end to end

## Key Design Decisions
- Bullet list of important implementation choices and why they were chosen

## Failure Handling
- Bullet list of how failures, retries, invalid input, or partial failures are handled

## Observability
- Bullet list of logs, metrics, tracing, or alerts that should exist

## Risks and Trade-offs
- Bullet list of risks, compromises, and things to watch
```

## 9.3 `prompts/spec-to-tasks/jira-task.md`

```md
You are helping prepare implementation work for Jira.

Project: {{project_name}}
Feature: {{feature_name}}

Requirements:
{{requirements}}

Architecture:
{{architecture}}

Generate a business-facing Jira task breakdown.

Output requirements:
- Use markdown
- Use stable task IDs in the form TASK-1, TASK-2, TASK-3
- Write in clear business-and-delivery language
- Keep technical detail brief but meaningful
- Break work into implementation-sensible chunks
- Include acceptance criteria for each task
- Include dependencies only when real
- Do not create fake tasks for meetings, testing, or deployment unless the feature genuinely requires them

Structure your response exactly as:

# Jira Tasks

## TASK-1: <title>
### Summary
<short business-facing summary>

### Acceptance Criteria
- ...
- ...

### Dependencies
- None
or
- TASK-x

## TASK-2: <title>
### Summary
<short business-facing summary>

### Acceptance Criteria
- ...
- ...

### Dependencies
- None
or
- TASK-x
```

## 9.4 `prompts/spec-to-tasks/task-prompt.md`

```md
You are preparing technical implementation guidance for AI-assisted development.

Project: {{project_name}}
Feature: {{feature_name}}

Requirements:
{{requirements}}

Architecture:
{{architecture}}

Jira tasks:
{{jira_task}}

Create a technical task prompt document that can be used to guide an implementation model task by task.

Output requirements:
- Use markdown
- Organize by task ID
- Include concrete technical direction
- Mention relevant patterns, constraints, and failure-handling expectations
- Avoid repeating large chunks of earlier documents
- Keep each task focused and actionable

Structure your response exactly as:

# Task Prompts

## TASK-1
### Objective
<what the model should implement>

### Technical Guidance
- ...

### Constraints
- ...

### Edge Cases / Failure Handling
- ...

### Done Criteria
- ...

## TASK-2
### Objective
<what the model should implement>

### Technical Guidance
- ...

### Constraints
- ...

### Edge Cases / Failure Handling
- ...

### Done Criteria
- ...
```

---

# 10. Output validation rules

MVP should not blindly trust AI output.

## 10.1 Validation mode

Use **light structural validation plus fail-fast**.

## 10.2 Workflow artifact validation

### `requirements.md`

Must contain:

* `# Requirements`
* `## Feature Summary`
* `## Functional Requirements`
* `## Non-Functional Requirements`
* `## Constraints`
* `## Assumptions`
* `## Open Questions`

### `architecture.md`

Must contain:

* `# Architecture`
* `## Overview`
* `## Components`
* `## Data Flow`
* `## Key Design Decisions`
* `## Failure Handling`
* `## Observability`
* `## Risks and Trade-offs`

### `jira-task.md`

Must contain:

* `# Jira Tasks`
* at least one `## TASK-<number>:`

### `task-prompt.md`

Must contain:

* `# Task Prompts`
* at least one `## TASK-<number>`

## 10.3 Validation failure behavior

If validation fails:

* write raw provider output to `<file>.invalid.md`
* do not overwrite canonical file
* print validation error
* log failure

---

# 11. Sync contract

## 11.1 Target path

Default sync target layout inside the repo:

```text
<repo>/.github/spec-forge/
  skills/
  instructions/
  knowledge/
```

Controlled by `sync.targetDir` in the project config (default: `.github/spec-forge`). A flat fallback, all asset types share the same base path.

Per-asset-type overrides via `sync.targets` take precedence over `targetDir` for that type:

```yaml
sync:
  targetDir: .github/spec-forge  # fallback for any type not listed below
  targets:
    skills: .github/prompts        # override for skills only
    instructions: .github          # override for instructions only
    # knowledge omitted → falls back to targetDir
```

Resolved path per asset: `<repoPath>/<effectiveTargetDir>/<assetType>/<id>.md`

When to use `targets`:
- Your AI tool reads skills/instructions from a specific path that differs from the default namespace (e.g., Copilot expects `.github/`, Claude expects `.claude/`)
- You want skills in one location and instructions in another
- You are publishing to multiple tool conventions from one project config

## 11.2 Metadata header

Each synced file begins with:

```md
<!-- SPEC-FORGE-SYNC
source: spec-forge/skills/spring-boot-resilience.md
assetId: spring-boot-resilience
assetType: skill
syncedAt: 2026-04-03T10:15:00Z
project: comm-service
-->
```

## 11.3 Overwrite behavior

Rules:

* `missing target` → write directly (silent)
* `unchanged target` → no action (silent)
* `changed target` → requires confirmation (see §11.5 sync confirmation flow)

## 11.4 Preview output

Preview shows one line per file:

* `CREATE`
* `UPDATE`
* `UNCHANGED`

Example:

```text
CREATE   .github/spec-forge/skills/kafka-patterns.md
UPDATE   .github/spec-forge/instructions/backend-service-baseline.md
UNCHANGED .github/spec-forge/knowledge/event-driven-guidelines.md
```

## 11.5 Sync confirmation flow

When one or more `UPDATE` entries are present:

1. Preview is displayed (one line per file as in §11.4)
2. For each `UPDATE`, a line-level unified diff is shown
3. A single prompt is shown: `Apply changes? (y/n)`
4. On `y`: all pending changes are applied atomically
5. On `n`: no files are written; the command exits cleanly

There are no per-file prompts. The user accepts or rejects all pending changes in a single action.

---

# 12. Harvester contract

## 12.1 Built-in probe definitions

```yaml
probes:
  resilience:
    keywords:
      - retry
      - backoff
      - timeout
      - circuit
      - idempotent

  auth:
    keywords:
      - jwt
      - oauth
      - authentication
      - authorization
      - security

  logging:
    keywords:
      - log
      - mdc
      - correlation
      - trace
```

## 12.2 Commit eligibility rules

A commit or diff is eligible for AI analysis only if all are true:

* author is not in `excludeAuthors`
* changed file extension is included
* changed line count is `>= minChangedLines`
* changed line count is `<= maxChangedLines`
* at least one probe keyword matches commit text or diff text

## 12.3 Harvester outputs

### Pattern file path

```text
spec-forge/harvested/patterns/<project>-<timestamp>-<slug>.md
```

### Candidate skill file path

```text
spec-forge/harvested/candidate-skills/<candidate-skill-id>.md
```

### Report path

```text
spec-forge/harvested/reports/<project>-<timestamp>.md
```

## 12.4 Commit window semantics

`commitWindow: 30` means the **last 30 commits** on the current branch, counted from `HEAD`. It is not a time-based window.

## 12.5 Keyword matching rules

* Probe keyword matching is case-insensitive.
* Keywords are matched against both commit message text and diff text.
* A commit is eligible for analysis if at least one keyword from at least one active probe matches.

## 12.6 Harvest dedupe contract

A pattern extraction result is considered a duplicate if a prior pattern file for the same project already contains a `## Title` value that normalizes to the same string.

Normalization: lowercase, collapse whitespace, strip punctuation.

Duplicate patterns are silently skipped. The harvest run continues; deduplication is not treated as a failure.

## 12.7 Harvest failure contract

* Commits are processed one at a time, in order.
* If a provider call for any single commit fails, harvest stops immediately (stop-on-first-failure).
* Pattern files successfully written before the point of failure are preserved.
* The error is logged and summarized in the harvest report.
* `.invalid.md` files produced by failed pattern extraction do not affect or replace prior successful pattern outputs.

---

# 13. Harvester prompt contracts

## 13.1 Pattern extraction prompt

```md
You are a senior software architect reviewing teammate code changes for reusable engineering patterns.

Project: {{project_name}}

Probe:
{{probe_name}}

Commit metadata and diff:
{{diff_input}}

Only report something if it is:
- non-trivial
- reusable across services or features
- meaningfully better than a naive implementation

If there is no meaningful reusable pattern, respond with exactly:
NONE

If there is a meaningful pattern, structure your response exactly as:

# Pattern Summary

## Title
<short name>

## Category
<auth|resilience|logging|data|api|other>

## Why It Matters
<short explanation>

## What Changed
- ...
- ...

## Reusable Guidance
- ...
- ...

## Example Signals
- ...
- ...
```

## 13.2 Candidate skill generation prompt

```md
You are converting an extracted engineering pattern into a draft reusable skill.

Pattern summary:
{{pattern_summary}}

Generate a candidate skill in markdown with YAML frontmatter.

Requirements:
- Keep it concise
- Make it reusable
- Include practical guidance
- Include one or two short examples
- Set confidence to low, medium, or high
- Include source references if available

Use this exact structure:

---
id: <kebab-case-id>
type: skill
version: 0.1.0
source: harvested
confidence: <low|medium|high>
tags:
  - <tag>
references:
  - <reference>
---

# Description

# Guidance

# Examples
```

## 13.3 Harvest report prompt

```md
You are summarizing a harvest run for a developer.

Project: {{project_name}}

Pattern findings:
{{pattern_summaries}}

Produce a concise report with this exact structure:

# Harvest Report

## Summary

## High-Value Findings
- ...

## Candidate Skills Created
- ...

## Recommended Promotions
- ...
```

---

# 14. Candidate skill schema

This is now authoritative.

## 14.1 File format

```md
---
id: kafka-idempotent-consumer
type: skill
version: 0.1.0
source: harvested
confidence: medium
tags:
  - kafka
  - resilience
references:
  - commit:abc123
  - report:comm-service-2026-04-03T10-15-00Z
---

# Description
Short explanation of the skill and when to use it.

# Guidance
- Bullet guidance
- Bullet guidance

# Examples
- Short example
- Short example
```

## 14.2 Promotion rules

A candidate skill is promotable only if:

* frontmatter contains required fields
* confidence is valid
* `# Description`, `# Guidance`, and `# Examples` sections exist

---

# 15. `analyze-change` contract

## 15.1 Command

```bash
spec-forge analyze-change <project> <feature> <from-version> <to-version>
```

Example:

```bash
spec-forge analyze-change comm-service campaign-retry v1 v2
```

## 15.2 Output markdown structure

```md
# Change Analysis: v1 -> v2

## Summary

## Requirements Changes

## Architecture Changes

## Jira Task Impact

### Unchanged Tasks

### Modified Tasks

### Removed Tasks

### New Tasks

## Task Prompt Impact

## Recommended Jira Actions
```

## 15.3 Output JSON structure

```json
{
  "project": "comm-service",
  "feature": "campaign-retry",
  "fromVersion": "v1",
  "toVersion": "v2",
  "summary": "string",
  "requirementsChanges": ["string"],
  "architectureChanges": ["string"],
  "jiraTaskImpact": {
    "unchanged": [
      { "taskId": "TASK-1", "title": "string" }
    ],
    "modified": [
      {
        "taskId": "TASK-2",
        "title": "string",
        "change": "string",
        "recommendedJiraUpdate": "string"
      }
    ],
    "removed": [
      {
        "taskId": "TASK-3",
        "title": "string",
        "reason": "string"
      }
    ],
    "new": [
      {
        "taskId": "TASK-4",
        "title": "string",
        "reason": "string",
        "suggestedDescription": "string"
      }
    ]
  },
  "taskPromptImpact": {
    "changed": true,
    "summary": "string"
  },
  "recommendedJiraActions": ["string"]
}
```

## 15.4 Task ID requirement

`jira-task.md` must use stable IDs in the form `TASK-1`, `TASK-2`, etc.

## 15.5 Output location

Analyze-change outputs are written to the feature folder, not inside any version folder:

```text
spec-forge/output/<project>/<feature>/analysis-<from>-<to>.md
spec-forge/output/<project>/<feature>/analysis-<from>-<to>.json
```

Both the `.md` and `.json` files are always written together. One is never written without the other.

## 15.6 Overwrite behavior

Analyze-change outputs are silently overwritten if they already exist. No confirmation is required.

## 15.7 Non-destructive rule

`analyze-change` reads from, but never writes to, workflow version output folders (`spec-forge/output/<project>/<feature>/<version>/`). It does not modify any workflow artifact.

---

# 16. Logging contract

Write logs to:

```text
spec-forge/.logs/
```

Each command run should log:

* timestamp
* command
* project
* feature
* version
* step
* provider
* durationMs
* outcome
* errorSummary if any

---

# 17. CLI surface

This is now the authoritative MVP CLI.

```bash
spec-forge init <project-name> --repo <path>

spec-forge run <workflow-or-step> --project <project> [--feature <feature>] [--version <version>] [--input-file <path>]

spec-forge sync <project-name>

spec-forge harvest <project-name>

spec-forge promote <candidate-skill-id>

spec-forge analyze-change <project> <feature> <from-version> <to-version>
```

---

# 18. Locked decisions and remaining implementation choices

All product and contract decisions are locked as of v0.5.

## 18.1 Locked decisions

| Decision | Value |
|---|---|
| Runtime | Node.js with TypeScript (strict mode) |
| CLI binary name | `spec-forge` |
| Providers in first build | Both Copilot CLI (`gh copilot`) and Claude CLI |
| Rerun scope | Downstream-only: specified step plus all steps that depend on it |
| Diff UX | Line-level unified diff displayed; single `y/n` confirmation |
| `init` output | Single project YAML file only — no prompts, workflows, or assets scaffolded |
| Overwrite: workflow outputs (rerun) | `.new.md` + diff + `y/n` confirmation |
| Overwrite: sync targets | Preview + single `y/n` confirmation for all pending changes |
| Overwrite: analyze-change outputs | Silent overwrite |
| Overwrite: logs | Silent overwrite |
| Prompt composition | Single `--- CONTEXT: ARTIFACTS ---` block; `{{user_input}}` is template-only |
| Harvest commit window | Last N commits from HEAD (not time-based) |
| Harvest keyword matching | Case-insensitive; matches commit message and diff text |
| Harvest dedupe | Normalized exact-title match; duplicates silently skipped |
| Harvest failure model | Stop-on-first-failure; prior outputs preserved |
| Analyze-change output | Both `.md` and `.json` always written together |
| Analyze-change read scope | Read-only against workflow artifacts; never writes to version folders |

## 18.2 Remaining implementation choices

These are engineering decisions that do not require product input but must be made before the relevant implementation begins.

### Provider CLI shell invocation

The exact shell syntax for invoking `gh copilot` and `claude` on Windows must be confirmed in the environment before adapter implementation is finalized. The `ProviderAdapter` interface is fixed; only the invocation detail varies.

### Config and workflow schema validation

Config and workflow YAML can be validated via JSON Schema (`ajv`), a TypeScript-native validation library (`zod`), or lightweight custom code. Any approach is acceptable as long as it enforces the rules defined in §7 and §10.

### CLI bootstrap / root detection

The spec assumes commands are run from the spec-forge root directory. Whether a command run from a subdirectory should climb to find `config.yaml` or fail with a clear error must be decided before the CLI bootstrap task is implemented.

### Prompt quality tuning

The first-pass prompts in §9 will require real-world tuning after initial runs. This is expected and is not a blocker for implementation.

