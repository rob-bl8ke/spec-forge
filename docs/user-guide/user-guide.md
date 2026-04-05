# 🧠 Spec Forge — User Manual (MVP)



# 1. 🚀 What Spec Forge Does

Spec Forge is a **local CLI system** that helps you:

* turn ideas into **requirements → architecture → tasks → execution prompts**
* iteratively refine specs with AI
* sync reusable patterns into repos
* learn from your team’s commits
* safely evolve specs without breaking execution (Jira)



# 2. 🏁 Getting Started



## 2.1 Install prerequisites

You need:

* Node.js (recommended runtime)
* Git
* One AI CLI:

  * GitHub Copilot CLI
  * OR Claude Code CLI



## 2.2 Project structure

Your working directory:

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
  output/
```



## 2.3 Initialize a project

```bash
spec-forge init comm-service --repo ../communication-service
```

Creates:

```yaml
# spec-forge/projects/comm-service.yaml
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



# 3. 🧩 Core Workflow: Spec → Tasks



## 3.1 Run full workflow

```bash
spec-forge run spec-to-tasks --project comm-service --feature campaign-retry
```



## 3.2 What happens

1. Prompts you for input
2. Generates:

   * `requirements.md`
   * `architecture.md`
   * `jira-task.md`
   * `task-prompt.md`



## 3.3 Output location

```text
spec-forge/output/comm-service/campaign-retry/v1/
```



## 3.4 Example input

```text
Implement retry logic for campaign execution using Kafka with idempotency.
```



## 3.5 Example output (simplified)

### requirements.md

```md
# Requirements

## Feature Summary
Retry failed campaign processing messages.

## Functional Requirements
- Retry failed Kafka messages
- Ensure idempotency

## Non-Functional Requirements
- High reliability
- No duplicate processing
```



### jira-task.md

```md
# Jira Tasks

## TASK-1: Implement retry mechanism
### Summary
Retry failed messages with backoff.

### Acceptance Criteria
- Retry triggered on failure
- Configurable backoff
```



# 4. 🔁 Iterative Refinement (CRITICAL)



## 4.1 Edit manually

Open:

```text
requirements.md
```

Refine it.



## 4.2 Rerun architecture

```bash
spec-forge run architecture --project comm-service --feature campaign-retry --version v1
```



## 4.3 What happens

* Loads updated requirements
* Generates `architecture.new.md`
* Shows diff
* Prompts:

```text
Replace architecture.md? (y/n)
```



## 4.4 Rerun tasks

```bash
spec-forge run jira-task --version v1
```



## 🔥 Best practice

Always refine:

```text
requirements → architecture → tasks
```



# 5. 🧠 Understanding Prompt Templates



## 5.1 How prompts work

Each workflow step uses a template.

Example:

```md
# prompts/spec-to-tasks/architecture.md

Requirements:
{{requirements}}
```



## 5.2 Available variables

| Variable         | Meaning             |
| - | - |
| {{requirements}} | previous step       |
| {{architecture}} | previous step       |
| {{jira_task}}    | previous step       |
| {{skills}}       | all selected skills |
| {{instructions}} | all instructions    |
| {{knowledge}}    | knowledge files     |
| {{user_input}}   | initial input       |



## 5.3 Prompt composition (actual structure)

```text
[template]

 CONTEXT: ARTIFACTS 
# requirements
...

 INSTRUCTIONS 
...

 SKILLS 
...

 KNOWLEDGE 
...
```


# 6. 🧰 Recommended Prompt Templates



## 6.1 Requirements (recommended tweak)

Add constraint enforcement:

```md
## Constraints
- Must be implementable in Spring Boot
- Must support Kafka retry patterns
```



## 6.2 Architecture (recommended tweak)

Add:

```md
## Technology Choices
- Framework
- Messaging
- Storage
```



## 6.3 Jira Tasks (recommended tweak)

Add:

```md
### Story Points (Optional)
```



## 6.4 Task Prompt (VERY important)

Add:

```md
### Code Expectations
- Follow existing project structure
- Include logging
- Include error handling
```



# 7. 🔄 Syncing into Your Repo



## 7.1 Add skills

```yaml
assets:
  skills:
    - kafka-patterns
    - spring-resilience
```



## 7.2 Run sync

```bash
spec-forge sync comm-service
```



## 7.3 Preview

```text
CREATE   skills/kafka-patterns.md
UPDATE   instructions/backend.md
```



## 7.4 Confirm

```text
Apply changes? (y/n)
```



## 7.5 Output

```text
repo/.github/spec-forge/
```



# 8. 🧠 Harvesting Team Knowledge



## 8.1 Run harvest

```bash
spec-forge harvest comm-service
```



## 8.2 What happens

* scans last 30 commits
* filters by:

  * file types
  * keywords
* extracts patterns



## 8.3 Output

```text
harvested/
  patterns/
  candidate-skills/
  reports/
```



## 8.4 Example pattern

```md
# Pattern Summary

## Title
Idempotent Kafka Consumer

## Why It Matters
Prevents duplicate processing

## Reusable Guidance
- Store processed IDs
```



## 8.5 Promote skill

```bash
spec-forge promote kafka-idempotent-consumer
```



# 9. 🔍 Handling Requirement Changes



## 9.1 Generate new version

```bash
spec-forge run spec-to-tasks --feature campaign-retry
```

Creates:

```text
v2/
```



## 9.2 Analyze change

```bash
spec-forge analyze-change comm-service campaign-retry v1 v2
```



## 9.3 Output

```text
analysis-v1-v2.md
analysis-v1-v2.json
```



## 9.4 Example result

```text
Modified:
- TASK-1 retry logic

Removed:
- TASK-2 simple retry

New:
- TASK-3 exponential backoff
```



## 9.5 What YOU do

* update Jira manually
* do NOT overwrite automatically



# 10. 🧠 Skills (Reusable Intelligence)



## 10.1 Example skill

```md

id: kafka-idempotent-consumer
type: skill
version: 0.1.0
confidence: high
tags:
  - kafka


# Description
Avoid duplicate processing

# Guidance
- Use deduplication table

# Examples
...
```



## 10.2 Best practices

* keep short
* focus on decisions
* include examples



# 11. 🧠 Instructions (Behavior Control)



## Example

```md
# Backend Service Rules

- Always include logging
- Use retry for transient failures
- Avoid blocking calls
```



# 12. 🧠 Knowledge (Reference Material)



## Example

```md
# Kafka Retry Patterns

- At-least-once delivery
- Idempotent consumer
```



# 13. ⚠️ Error Handling



## Missing dependency

```text
Missing required input: requirements.md
```



## Invalid output

```text
architecture.invalid.md
```



## Recovery

```bash
spec-forge run architecture --version v2
```



# 14. 🔄 Daily Workflow (Realistic)



## Morning

```bash
spec-forge harvest comm-service
```



## Start feature

```bash
spec-forge run spec-to-tasks
```



## Refine

```bash
spec-forge run architecture
spec-forge run jira-task
```



## Before coding

```bash
spec-forge sync comm-service
```



## After changes

```bash
spec-forge analyze-change v1 v2
```



# 15. 🔥 Best Practices



## DO

* refine incrementally
* trust but verify outputs
* keep skills concise
* promote only high-value patterns



## DON’T

* regenerate blindly
* overwrite without review
* sync everything everywhere
* trust harvest output blindly



# 🏁 Final Mental Model

Spec Forge is:

```text
Idea → Spec → Tasks → Execution → Feedback → Spec Evolution
```



# 🚀 What You Now Have

You now have:

* a **repeatable thinking system**
* a **knowledge compounding loop**
* a **safe evolution mechanism**
* a **repo-integrated AI workflow**
