Excellent. We’ll lock the name to **spec-forge** and push this to a more implementable **v0.3**.

This version resolves the highest-risk gaps:

* product naming
* provider adapter contract
* exact prompt file set for `spec-to-tasks`
* candidate skill schema
* harvester prompt contracts
* config validation expectations
* version naming rules
* output validation rules

---

# Spec Forge MVP Technical Spec v0.3

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

## 5.4 Rerun temp file rules

Single-step reruns write to temp first:

```text
architecture.new.md
jira-task.new.md
```

The user must confirm replacement.

---

# 6. Provider adapter contract

This is now explicit.

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
```

Project config can override active provider:

```yaml
provider: claude
```

Project-level value wins.

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

logging:
  level: info
  writePromptFiles: true
```

## 7.2 Project config schema

```yaml
name: comm-service
repoPath: ../communication-service

provider: copilot

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
  targetDir: .github/spec-forge
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

* `{{user_input}}`
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

1. raw step prompt template with placeholders
2. substitute runtime and artifact variables
3. append instructions block
4. append skills block
5. append knowledge block

### Final composed structure

```text
[step prompt with resolved variables]

--- INSTRUCTIONS ---
[concatenated instructions]

--- SKILLS ---
[concatenated skills]

--- KNOWLEDGE ---
[concatenated knowledge]
```

This is the authoritative MVP composition rule.

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

Sync into repo:

```text
<repo>/.github/spec-forge/
  skills/
  instructions/
  knowledge/
```

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

Default policy: `prompt`

Rules:

* missing target → write directly
* unchanged target → no action
* changed target → write `.new` file
* show summary and ask whether to replace

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

# 18. What still needs to be locked before implementation

At this point, the spec is much closer to implementable. The remaining decisions are mostly engineering choices rather than product ambiguity.

## Still to decide

### 1. Runtime choice

We still need to choose:

* Node.js CLI
* .NET CLI

This is now a real implementation choice, not a spec ambiguity.

### 2. Exact provider adapter shell implementation

The interface is fixed, but the concrete adapter code still needs to be chosen and tested against your environment for:

* Copilot CLI
* Claude Code

### 3. Prompt quality tuning

The first-pass prompts are now defined, but they will still need real-world tuning after the first few runs.

### 4. Diff UX detail

We defined preview behavior, but not whether step rerun and sync should show:

* line-level unified diff
* simple changed-file summary
* both

### 5. Schema validation implementation

We should decide whether config and workflow validation is done via:

* JSON Schema
* custom validation code
* lightweight library-specific validation

