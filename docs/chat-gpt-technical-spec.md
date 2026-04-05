# 🧠 Spec Forge — MVP System Specification (v1.0)

---

# 1. Overview

## 1.1 Purpose

Spec Forge is a **local-first CLI tool** that enables developers to:

* Generate structured implementation artifacts from requirements
* Iteratively refine those artifacts
* Sync reusable AI assets into repositories
* Harvest reusable engineering patterns from git history
* Analyze changes between spec versions without breaking execution work

---

## 1.2 Core Principles

* **Filesystem is the source of truth**
* **No implicit behavior (fail fast, explicit commands)**
* **No silent overwrite of user-authored artifacts**
* **LLM is orchestrated, not trusted blindly**
* **Everything is inspectable and versioned**

---

# 2. System Architecture

```text
spec-forge (CLI)
├── Command Layer
├── Workflow Engine
├── Prompt Engine
├── Provider Adapter
├── Sync Engine
├── Harvester Engine
├── Change Analyzer
└── File System (source of truth)
```

---

# 3. Directory Structure

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

# 4. Core Concepts

---

## 4.1 Artifacts (Workflow Outputs)

Each feature generates:

* `requirements.md`
* `architecture.md`
* `jira-task.md`
* `task-prompt.md`

---

## 4.2 Output Structure

```text
spec-forge/output/<project>/<feature>/<version>/
```

Example:

```text
spec-forge/output/comm-service/campaign-retry/v1/
```

---

## 4.3 Versioning Rules

* Full workflow run → creates new version (`v1`, `v2`, …)
* Step rerun → modifies existing version (with confirmation)
* Requirements step cannot be rerun → must create new version

---

## 4.4 Feature Naming

Slug rules:

* lowercase
* spaces → `-`
* remove special chars
* collapse multiple dashes

---

# 5. CLI Interface

---

## 5.1 Commands

```bash
spec-forge init <project> --repo <path>

spec-forge run <workflow-or-step> --project <project> [--feature <feature>] [--version <version>] [--input-file <path>]

spec-forge sync <project>

spec-forge harvest <project>

spec-forge promote <candidate-skill-id>

spec-forge analyze-change <project> <feature> <from-version> <to-version>
```

---

# 6. Project Configuration

---

## 6.1 File

```text
spec-forge/projects/<project>.yaml
```

---

## 6.2 Schema

```yaml
name: comm-service
repoPath: ../communication-service

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
  enabled: true
  commitWindow: 30
  excludeAuthors: []
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

---

# 7. Workflow Engine

---

## 7.1 Workflow Definition

```yaml
id: spec-to-tasks

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

## 7.2 Execution Rules

* No implicit step execution
* Missing input → fail fast
* Steps run sequentially or individually

---

## 7.3 Step Execution Flow

```text
1. Resolve inputs
2. Load prompt
3. Compose final prompt
4. Call provider
5. Validate output
6. Write file
```

---

# 8. Prompt Engine

---

## 8.1 Template Syntax

```text
{{variable_name}}
```

---

## 8.2 Variable Types

### Runtime

* `{{user_input}}`
* `{{project_name}}`
* `{{feature_name}}`

### Artifacts

* `{{requirements}}`
* `{{architecture}}`
* `{{jira_task}}`
* `{{task_prompt}}`

### Assets

* `{{skills}}`
* `{{instructions}}`
* `{{knowledge}}`

---

## 8.3 User Input Rule

> `user_input` is injected ONLY via template variables
> It is never appended globally

---

## 8.4 Prompt Composition

```text
[STEP PROMPT]

--- CONTEXT: ARTIFACTS ---

# requirements
...

---
# architecture
...

--- INSTRUCTIONS ---
...

--- SKILLS ---
...

--- KNOWLEDGE ---
...
```

---

## 8.5 Rendering Rules

* Single artifact section
* Each artifact wrapped
* Sections omitted if empty
* Multiple assets separated by `---`

---

# 9. Provider Adapter

---

## 9.1 Interface

```ts
interface ProviderAdapter {
  generate(request): Promise<response>
}
```

---

## 9.2 Request

```ts
{
  prompt: string
  workingDirectory?: string
  timeoutMs: number
}
```

---

## 9.3 Behavior

* success = exitCode 0 AND stdout not empty
* timeout = 120s default
* retry once on process failure
* no retry on validation failure

---

## 9.4 Provider Resolution

```text
project.provider ?? global.provider.active
```

---

# 10. Validation

---

## 10.1 Required Sections

Each artifact must contain predefined headers.

---

## 10.2 Failure Handling

If invalid:

```text
<file>.invalid.md
```

* canonical file not overwritten
* command fails visibly

---

## 10.3 Recovery

User reruns step manually.

---

# 11. Rerun Behavior

---

## 11.1 Allowed

| Step         | Allowed |
| ------------ | ------- |
| requirements | ❌       |
| architecture | ✅       |
| jira-task    | ✅       |
| task-prompt  | ✅       |

---

## 11.2 Flow

1. write `.new` file
2. show diff
3. prompt user
4. replace if approved

---

# 12. Sync Engine

---

## 12.1 Target Path

```text
<repo>/.github/spec-forge/
```

---

## 12.2 Structure

```text
skills/
instructions/
knowledge/
```

---

## 12.3 Metadata Header

```md
<!-- SPEC-FORGE-SYNC
source: spec-forge/skills/x.md
assetId: x
assetType: skill
syncedAt: timestamp
project: name
-->
```

---

## 12.4 Sync Flow

1. preview
2. diff (if changed)
3. single confirmation
4. apply

---

## 12.5 No Silent Overwrite

---

# 13. Harvester Engine

---

## 13.1 Scope

* last N commits (default 30)
* local git only

---

## 13.2 Filters

* exclude authors
* include file extensions
* line count range
* keyword match (case-insensitive)

---

## 13.3 Probes

```yaml
resilience:
  - retry
  - timeout
```

---

## 13.4 Deduplication

```ts
normalize(title)
```

Exact match only.

---

## 13.5 Outputs

```text
patterns/
candidate-skills/
reports/
```

---

# 14. Candidate Skills

---

## 14.1 Schema

```md
---
id: kafka-pattern
type: skill
version: 0.1.0
source: harvested
confidence: medium
tags: []
references: []
---

# Description
# Guidance
# Examples
```

---

## 14.2 Promotion

```bash
spec-forge promote <id>
```

---

# 15. Analyze Change

---

## 15.1 Command

```bash
spec-forge analyze-change <project> <feature> v1 v2
```

---

## 15.2 Outputs

```text
analysis-v1-v2.md
analysis-v1-v2.json
```

---

## 15.3 Behavior

* does not modify artifacts
* may overwrite analysis files

---

# 16. Workflow Failure Model

---

## Rule

> Stop on first failure, preserve prior outputs

---

## Example

```text
requirements ✔
architecture ✔
jira-task ❌
```

Result:

```text
jira-task.invalid.md
```

---

# 17. Logging

---

## Location

```text
spec-forge/.logs/
```

---

## Contents

* command
* project
* feature
* version
* step
* duration
* outcome

---

# 18. Final Execution Model

---

## Example Flow

```bash
spec-forge run spec-to-tasks --project comm-service --feature campaign-retry
```

→ generates v1

---

Refine:

```bash
spec-forge run architecture --version v1
```

---

Change requirements → new version:

```bash
spec-forge run spec-to-tasks --feature campaign-retry
```

→ v2

---

Compare:

```bash
spec-forge analyze-change comm-service campaign-retry v1 v2
```

---

Sync:

```bash
spec-forge sync comm-service
```

---

Harvest:

```bash
spec-forge harvest comm-service
```

---

# 🏁 Final Statement

This specification defines:

* all inputs
* all outputs
* all execution paths
* all failure modes
* all file contracts

