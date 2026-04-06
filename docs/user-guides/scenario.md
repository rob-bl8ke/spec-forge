Here’s a realistic end-to-end walkthrough of me using **Spec Forge** from nothing to a final Jira task list.

I’ll act as the user at the console, show what I type, what the system does, how I edit artifacts between runs, how new requirements force a new version, and how I finally land on a Jira task list I’m happy with.

---

# Scenario

I want to design a new feature for a service called `comm-service`.

### Feature idea

Add **campaign retry handling** for failed Kafka-driven campaign processing, with:

* idempotency
* backoff
* observability
* configuration support

At the start, I only know the rough problem, not the final design.

---

# 1. Start from scratch

## 1.1 Create the Spec Forge workspace

I create my root working folder structure.

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

## 1.2 Add global config

`spec-forge/config.yaml`

```yaml
provider:
  active: copilot
  timeoutMs: 120000
  model: gpt-4.1

logging:
  level: info
  writePromptFiles: true
```

The `model` field is optional. If omitted, the adapter falls back to its built-in default (`gpt-4.1` for Copilot). Setting it here means all projects share the same model unless a project overrides it.

## 1.3 Add the workflow

`spec-forge/workflows/spec-to-tasks.yaml`

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

## 1.4 Add the prompts

I create the four prompt files from the spec.

For example, `spec-forge/prompts/spec-to-tasks/requirements.md`:

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

I do the same for:

* `architecture.md`
* `jira-task.md`
* `task-prompt.md`

## 1.5 Add a couple of starter assets

### `spec-forge/instructions/backend-service-baseline.md`

```md
# Backend Service Baseline

- Prefer concrete, implementation-oriented outputs
- Include failure handling where relevant
- Include observability guidance where relevant
- Avoid generic filler and theoretical recommendations
- Respect the existing project structure and operational style
```

### `spec-forge/skills/spring-boot-resilience.md`

```md
---
id: spring-boot-resilience
type: skill
version: 0.1.0
source: manual
confidence: high
tags:
  - spring
  - resilience
references: []
---

# Description
Practical resilience guidance for Spring Boot services.

# Guidance
- Use retry only for transient failures
- Avoid retry on non-idempotent operations unless protected
- Prefer explicit backoff configuration
- Include structured logs and useful metrics
- Treat idempotency as a first-class design concern for message consumers

# Examples
- Kafka consumer with deduplication
- HTTP retry with bounded attempts and backoff
```

### `spec-forge/knowledge/event-driven-guidelines.md`

```md
# Event-Driven Guidelines

- Consumers should be safe under at-least-once delivery
- Failures should be observable
- Replay and retry behavior should be intentional
- Configuration should be externalized where reasonable
```

---

# 2. Initialize the project

My service already exists at `../communication-service`.

## Console

```bash
spec-forge init comm-service --repo ../communication-service
```

## System

```text
Project initialized: comm-service
Created: spec-forge/projects/comm-service.yaml
```

## Generated project file

`spec-forge/projects/comm-service.yaml`

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

## I immediately enrich it

I edit it to use my assets, exclude myself from harvests, and pin the model for this project.

```yaml
name: comm-service
repoPath: ../communication-service

provider: copilot
model: gpt-4.1

workflowDefaults:
  defaultWorkflow: spec-to-tasks

assets:
  skills:
    - spring-boot-resilience
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

I leave `targetDir: .github/spec-forge` as-is for now. This default keeps spec-forge-managed files namespaced and separate from native GitHub tooling. My team uses Copilot, but we have not yet configured it to scan `.github/spec-forge/` in VS Code. I will do that separately — syncing gets files into the repo; configuring the AI tool makes them discoverable.

If I wanted Copilot to pick up instructions automatically without any custom workspace configuration, I could override the path for that type:

```yaml
sync:
  targetDir: .github/spec-forge   # fallback for skills and knowledge
  targets:
    instructions: .github         # Copilot reads .github/ by default
```

For now I keep the default and will configure VS Code to scan `.github/spec-forge/` as an additional workspace folder.

---

# 3. Sync assets into the repo

Before designing the feature, I want the repo to have the right synced assets.

## Console

```bash
spec-forge sync comm-service
```

## System preview

```text
CREATE   ../communication-service/.github/spec-forge/skills/spring-boot-resilience.md
CREATE   ../communication-service/.github/spec-forge/instructions/backend-service-baseline.md
CREATE   ../communication-service/.github/spec-forge/knowledge/event-driven-guidelines.md
```

## System prompt

```text
Apply changes? (y/n)
```

## Me

```text
y
```

## System

```text
Sync complete.
```

Now my repo has:

```text
../communication-service/.github/spec-forge/
  skills/
    spring-boot-resilience.md
  instructions/
    backend-service-baseline.md
  knowledge/
    event-driven-guidelines.md
```

These files are committed to source control so all teammates get them. Anyone working in the `communication-service` repo can add `.github/spec-forge/` as a workspace folder in VS Code (or configure their AI tool's scan paths) to have these skills and instructions automatically available during development.

---

# 4. Generate the first version of the feature spec

I now want to create the first draft.

## Console

```bash
spec-forge run spec-to-tasks --project comm-service --feature campaign-retry
```

## System prompt

```text
Enter feature input:
```

## Me

```text
We need to support retrying failed campaign execution messages consumed from Kafka.
The retry behavior must avoid duplicate processing.
We need useful logs and metrics.
The implementation should be configurable and practical for our Spring Boot service.
```

## System

```text
Running workflow: spec-to-tasks
Project: comm-service
Feature: campaign-retry
Creating version: v1

Step 1/4: requirements
Step 2/4: architecture
Step 3/4: jira-task
Step 4/4: task-prompt

Workflow complete.
Output: spec-forge/output/comm-service/campaign-retry/v1/
```

---

# 5. Review version 1

Generated folder:

```text
spec-forge/output/comm-service/campaign-retry/v1/
  user-input.md
  requirements.md
  architecture.md
  jira-task.md
  task-prompt.md
```

## 5.1 First requirements draft

I open `requirements.md`.

```md
# Requirements

## Feature Summary
Add retry handling for failed campaign execution Kafka messages in the communication service while avoiding duplicate processing and improving operational visibility.

## Functional Requirements
- Retry failed campaign execution messages
- Support configurable retry behavior
- Prevent duplicate campaign processing during retry scenarios
- Record retry attempts in logs and metrics
- Allow retry behavior to be enabled and tuned by configuration

## Non-Functional Requirements
- Reliable under at-least-once delivery conditions
- Observable through logs and metrics
- Maintainable and consistent with Spring Boot service practices

## Constraints
- Must work within the existing Spring Boot service
- Must integrate with Kafka-based processing
- Must avoid unsafe duplicate processing

## Assumptions
- Campaign execution currently consumes Kafka messages
- Failures can be retried safely if idempotency protections exist
- Retry configuration can be externalized

## Open Questions
- Should retries happen inline or through a retry topic?
- What is the maximum retry count?
- How should permanently failed messages be handled?
```

This is decent, but too vague for me. I know already that I want a more explicit failure path and dead-letter behavior.

---

# 6. Manually refine the requirements

I edit `requirements.md` myself.

## My updated `requirements.md`

```md
# Requirements

## Feature Summary
Add retry handling for failed campaign execution Kafka messages in the communication service while preventing duplicate execution and improving operational visibility.

## Functional Requirements
- Retry transient campaign execution failures
- Prevent duplicate execution of the same logical campaign work item
- Support configurable retry count and backoff settings
- Publish permanently failed messages to a dead-letter path after retry exhaustion
- Record retry attempts, final failure, and successful recovery in logs
- Expose retry and failure metrics
- Allow the feature to be enabled or disabled by configuration

## Non-Functional Requirements
- Safe under Kafka at-least-once delivery semantics
- Observable through structured logs and metrics
- Compatible with existing Spring Boot operational patterns
- Simple enough for an initial production rollout

## Constraints
- Must work inside the existing Spring Boot communication service
- Must integrate with existing Kafka consumer flow
- Must not rely on unsafe duplicate reprocessing
- Must avoid introducing a design that is difficult to operate or explain

## Assumptions
- A message can be identified uniquely enough to support idempotency checks
- Retryable vs non-retryable failures can be distinguished
- Dead-letter handling is acceptable for permanently failed messages

## Open Questions
- Should idempotency be implemented using a database table or another mechanism?
- Should backoff be consumer-side or topic-based?
- What exact metrics are needed for operations?
```

Now I want the architecture regenerated from my improved requirements.

---

# 7. Regenerate architecture inside v1

## Console

```bash
spec-forge run architecture --project comm-service --feature campaign-retry --version v1
```

## System

```text
Generating: architecture.new.md
Showing diff against architecture.md
```

## Diff preview

```diff
- ## Failure Handling
- - Retry failed processing with configurable retry attempts
+ ## Failure Handling
+ - Classify failures into retryable and non-retryable categories
+ - Retry retryable failures using configurable max-attempt and backoff settings
+ - Route exhausted retry attempts to a dead-letter path
+ - Protect against duplicate execution using idempotency checks before processing
+ - Emit structured logs and metrics for retry start, retry success, and dead-letter outcome
```

## System prompt

```text
Replace architecture.md? (y/n)
```

## Me

```text
y
```

## System

```text
Updated: architecture.md
```

---

# 8. Review the improved architecture

I open `architecture.md`.

```md
# Architecture

## Overview
Add a retry-aware campaign execution flow in the existing Kafka consumer pipeline, with idempotency protection, configurable retry behavior, structured observability, and a dead-letter path for exhausted failures.

## Components
- Kafka campaign consumer
- Failure classification component
- Idempotency check/store
- Retry handling component
- Dead-letter publishing path
- Metrics and structured logging integration
- Configuration properties for retry tuning

## Data Flow
- Consume campaign execution message from Kafka
- Check whether the logical work item has already been processed
- If already processed, skip duplicate execution and log accordingly
- Execute campaign work
- If execution succeeds, mark as processed and emit success telemetry
- If execution fails with a retryable error, apply retry behavior based on configuration
- If retries are exhausted, publish the message to a dead-letter path and emit failure telemetry
- If execution fails with a non-retryable error, bypass retry and send to dead-letter handling immediately

## Key Design Decisions
- Use explicit idempotency checks before executing work
- Treat retryable and non-retryable failures differently
- Externalize retry configuration through Spring Boot properties
- Add dead-letter handling instead of infinite retry
- Keep the implementation inside the current service boundary for MVP

## Failure Handling
- Classify failures into retryable and non-retryable categories
- Retry retryable failures using configurable max-attempt and backoff settings
- Route exhausted retry attempts to a dead-letter path
- Protect against duplicate execution using idempotency checks before processing
- Emit structured logs and metrics for retry start, retry success, and dead-letter outcome

## Observability
- Structured logs for retry attempt, retry exhaustion, duplicate detection, and dead-letter publication
- Metrics for retry count, retry success, final failure, duplicate skip count
- Error visibility sufficient for production debugging

## Risks and Trade-offs
- Database-backed idempotency adds operational and schema complexity
- Inline retry is simpler but may be less flexible than topic-based retry
- Failure classification must be consistent to avoid unsafe retries
```

This is now much closer to what I want.

---

# 9. Generate a better Jira task list from the revised architecture

Because architecture changed, I now want the Jira breakdown refreshed.

## Console

```bash
spec-forge run jira-task --project comm-service --feature campaign-retry --version v1
```

## System

```text
Generating: jira-task.new.md
Showing diff against jira-task.md
```

## Diff preview

```diff
- ## TASK-2: Add retry handling
+ ## TASK-2: Add retry handling and retry classification

- ## TASK-3: Add logging
+ ## TASK-3: Add idempotency protection

+ ## TASK-4: Add dead-letter handling
+ ## TASK-5: Add observability for retry outcomes
```

## System prompt

```text
Replace jira-task.md? (y/n)
```

## Me

```text
y
```

## System

```text
Updated: jira-task.md
```

---

# 10. Review Jira task list v1

I open `jira-task.md`.

```md
# Jira Tasks

## TASK-1: Add retry configuration support
### Summary
Introduce configuration for enabling retry behavior and tuning retry attempts and backoff.

### Acceptance Criteria
- Retry behavior can be enabled or disabled through configuration
- Max retry attempts can be configured
- Backoff settings can be configured

### Dependencies
- None

## TASK-2: Add retry handling and retry classification
### Summary
Implement retry flow for retryable campaign execution failures and bypass retry for non-retryable failures.

### Acceptance Criteria
- Retryable failures are retried according to configuration
- Non-retryable failures bypass retry logic
- Retry exhaustion is handled consistently

### Dependencies
- TASK-1

## TASK-3: Add idempotency protection
### Summary
Protect campaign execution from duplicate processing during Kafka redelivery or retry scenarios.

### Acceptance Criteria
- Duplicate executions are detected before work is performed
- Already-processed work items are skipped safely
- Duplicate detection is observable

### Dependencies
- None

## TASK-4: Add dead-letter handling
### Summary
Route permanently failed campaign messages to a dead-letter path after retry exhaustion or non-retryable failure.

### Acceptance Criteria
- Permanently failed messages are routed to dead-letter handling
- Dead-letter routing is triggered for retry exhaustion
- Dead-letter routing is triggered for non-retryable failure where appropriate

### Dependencies
- TASK-2

## TASK-5: Add observability for retry outcomes
### Summary
Add logs and metrics for retry attempts, duplicate detection, exhausted failures, and dead-letter outcomes.

### Acceptance Criteria
- Retry attempt activity is logged
- Duplicate skip activity is logged
- Metrics exist for retry success and exhausted failure
- Dead-letter outcomes are observable

### Dependencies
- TASK-2
- TASK-3
- TASK-4
```

This is good, but I still think the idempotency task is too vague. I want technical guidance for implementation too.

---

# 11. Regenerate the technical task prompts

## Console

```bash
spec-forge run task-prompt --project comm-service --feature campaign-retry --version v1
```

## System

```text
Generating: task-prompt.new.md
Showing diff against task-prompt.md
```

## Me

```text
y
```

## System

```text
Updated: task-prompt.md
```

I open the result.

### Example excerpt

```md
# Task Prompts

## TASK-3
### Objective
Introduce idempotency protection so duplicate campaign work is not executed more than once.

### Technical Guidance
- Identify a stable logical work item key from the consumed message
- Check whether the work item has already been processed before executing business logic
- Persist successful processing in a durable mechanism that supports duplicate detection
- Ensure duplicate detection is observable and safe under retry and Kafka redelivery conditions

### Constraints
- Must fit within the current Spring Boot service
- Must not allow duplicate campaign execution
- Should remain understandable and maintainable for the team

### Edge Cases / Failure Handling
- Duplicate messages arriving after success
- Retry and redelivery overlapping
- Partial failure before marking processed

### Done Criteria
- Duplicate campaign work is skipped safely
- Duplicate detection is logged or metered
- The implementation is consistent with retry behavior
```

This is useful. At this point I could create Jira tickets, but before I do, I want to learn from recent team work to see whether there’s a better retry/idempotency pattern already used elsewhere.

---

# 12. Run harvest before locking the design

## Console

```bash
spec-forge harvest comm-service
```

## System

```text
Scanning last 30 commits...
Filtering by extensions, authors, and probes...
Found 4 eligible diffs
Analyzing patterns...
Generated:
- 2 pattern summaries
- 1 candidate skill
- 1 report
```

## Output folder

```text
spec-forge/harvested/
  patterns/
  candidate-skills/
  reports/
```

I open the report.

### Example `harvested/reports/comm-service-2026-04-05T10-15-00.md`

```md
# Harvest Report

## Summary
Two high-value resilience-related patterns were found in recent teammate commits.

## High-Value Findings
- Retry classification based on exception type
- Database-backed deduplication before Kafka side effects

## Candidate Skills Created
- kafka-idempotent-consumer

## Recommended Promotions
- kafka-idempotent-consumer
```

I also open the candidate skill.

### `harvested/candidate-skills/kafka-idempotent-consumer.md`

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
  - report:comm-service-2026-04-05T10-15-00
---

# Description
Use durable duplicate detection to make Kafka-driven processing safe under redelivery and retry.

# Guidance
- Derive a stable logical work key
- Check duplicate state before executing side effects
- Persist processed state only after successful completion
- Emit logs or metrics for duplicate skip and duplicate detection failures

# Examples
- Deduplication table keyed by work item ID
- Pre-processing duplicate check in Kafka consumer flow
```

This is directly relevant, so I promote it.

## Console

```bash
spec-forge promote kafka-idempotent-consumer
```

## System

```text
Promote candidate skill 'kafka-idempotent-consumer' to skills/? (y/n)
```

## Me

```text
y
```

## System

```text
Promoted: spec-forge/skills/kafka-idempotent-consumer.md
```

Then I add it to my project config.

```yaml
assets:
  skills:
    - spring-boot-resilience
    - kafka-idempotent-consumer
  instructions:
    - backend-service-baseline
  knowledge:
    - event-driven-guidelines
```

---

# 13. Now a new requirement appears

This is the real-world part.

My first v1 task list is already good, but now the business clarifies something important:

> Retry should not happen inline in the same consumer thread.
> It should use a retry topic approach to avoid long-running consumer blocking.

This changes requirements and architecture materially. I should **not** mutate v1 root requirements. I need a **new version**.

---

# 14. Generate version 2 from the updated requirement

## Console

```bash
spec-forge run spec-to-tasks --project comm-service --feature campaign-retry
```

## System prompt

```text
Enter feature input:
```

## Me

```text
We need to support retrying failed campaign execution messages consumed from Kafka.
Retry behavior must avoid duplicate processing.
We need useful logs and metrics.
The implementation should be configurable.
Retries should use a retry topic approach rather than inline consumer-thread retry.
Permanently failed messages should go to a dead-letter path.
```

## System

```text
Running workflow: spec-to-tasks
Project: comm-service
Feature: campaign-retry
Creating version: v2

Step 1/4: requirements
Step 2/4: architecture
Step 3/4: jira-task
Step 4/4: task-prompt

Workflow complete.
Output: spec-forge/output/comm-service/campaign-retry/v2/
```

---

# 15. Review v2 outputs

I open `v2/architecture.md`.

### Example excerpt

```md
# Architecture

## Overview
Introduce retry-topic-based handling for retryable campaign execution failures, combined with idempotency protection, dead-letter routing, and structured observability.

## Components
- Primary Kafka campaign consumer
- Retry classification component
- Retry topic publisher
- Retry topic consumer
- Idempotency check/store
- Dead-letter publisher
- Metrics and structured logging integration
- Retry configuration properties
```

This is a big enough change that the old Jira list is no longer the right final one. Time for impact analysis.

---

# 16. Compare v1 and v2

## Console

```bash
spec-forge analyze-change comm-service campaign-retry v1 v2
```

## System

```text
Analyzing changes between v1 and v2...
Generated:
- spec-forge/output/comm-service/campaign-retry/analysis-v1-v2.md
- spec-forge/output/comm-service/campaign-retry/analysis-v1-v2.json
```

I open the markdown report.

### Example `analysis-v1-v2.md`

```md
# Change Analysis: v1 -> v2

## Summary
The design shifted from inline retry to retry-topic-based retry orchestration. This changes the architecture significantly and impacts the Jira task breakdown.

## Requirements Changes
- Retry must use a retry topic approach instead of inline retry
- Dead-letter handling remains required
- Idempotency remains required

## Architecture Changes
- Added retry topic publisher and retry topic consumer
- Removed reliance on inline consumer-thread retry
- Increased messaging topology complexity

## Jira Task Impact

### Unchanged Tasks
- TASK-3: Add idempotency protection
- TASK-5: Add observability for retry outcomes

### Modified Tasks
- TASK-1: Add retry configuration support
  - What changed: Configuration now covers retry topic naming and routing behavior in addition to retry count/backoff
  - What to update in Jira: Expand acceptance criteria to cover retry topic configuration

- TASK-2: Add retry handling and retry classification
  - What changed: Retry handling now includes publishing to retry topic and consuming from retry topic
  - What to update in Jira: Rewrite task summary and acceptance criteria around topic-based retry flow

### Removed Tasks
- None

### New Tasks
- TASK-6: Add retry topic publishing
  - Why it is required: Retry behavior is now topic-based
  - Suggested description: Publish retryable failures to a retry topic with the required metadata

- TASK-7: Add retry topic consumer flow
  - Why it is required: Retry behavior now requires a dedicated consumer path
  - Suggested description: Consume retry-topic messages and re-enter execution safely

## Task Prompt Impact
The technical implementation guidance should be regenerated because retry orchestration has changed materially.

## Recommended Jira Actions
- Update TASK-1 to include retry topic configuration
- Rewrite TASK-2 to reflect topic-based retry orchestration
- Add TASK-6 and TASK-7
- Regenerate task prompts before implementation starts
```

This is exactly the kind of guardrail I want.

---

# 17. Decide what to do with Jira

Suppose I have not yet created Jira tickets. Then I can just take v2 as the new baseline.

If I had already created tickets from v1, I would:

* update TASK-1
* rewrite TASK-2
* add TASK-6 and TASK-7
* leave TASK-3 and TASK-5 mostly alone

In this walkthrough, I haven’t created them yet, so v2 becomes my working version.

---

# 18. Refine v2 manually before finalizing

I inspect `v2/jira-task.md`. It’s good, but I want the tasks a bit more implementation-sensible and separated more cleanly.

So I manually edit `v2/architecture.md` first to clarify that retry topic publishing and retry topic consuming are separate implementation slices.

## My manual tweak to `v2/architecture.md`

Under `## Components` I make sure it clearly lists:

```md
- Primary Kafka campaign consumer
- Retryable failure classifier
- Retry topic publisher
- Retry topic consumer
- Idempotency store/check
- Dead-letter publisher
- Retry configuration properties
- Observability instrumentation
```

Then I regenerate Jira tasks again inside `v2`.

## Console

```bash
spec-forge run jira-task --project comm-service --feature campaign-retry --version v2
```

## System

```text
Generating: jira-task.new.md
Showing diff against jira-task.md
```

## Diff excerpt

```diff
+ ## TASK-6: Add retry topic publishing
+ ## TASK-7: Add retry topic consumer handling
+ ## TASK-8: Add dead-letter routing for exhausted retry-topic messages
```

## Me

```text
y
```

Now I open the updated file.

---

# 19. Final Jira task list

This is the point where I’m finally happy.

### `spec-forge/output/comm-service/campaign-retry/v2/jira-task.md`

```md
# Jira Tasks

## TASK-1: Add retry feature configuration
### Summary
Introduce configuration for enabling retry behavior, tuning retry settings, and defining retry-topic and dead-letter routing settings.

### Acceptance Criteria
- Retry behavior can be enabled or disabled by configuration
- Retry topic settings can be configured
- Dead-letter settings can be configured
- Retry count and backoff-related settings are configurable where applicable

### Dependencies
- None

## TASK-2: Add retryable vs non-retryable failure classification
### Summary
Implement a consistent mechanism for classifying campaign execution failures so only retryable failures enter the retry flow.

### Acceptance Criteria
- Retryable failures are classified consistently
- Non-retryable failures bypass retry-topic routing
- Classification behavior is testable and understandable

### Dependencies
- None

## TASK-3: Add idempotency protection for campaign execution
### Summary
Protect campaign execution from duplicate processing across primary consumption, retry-topic consumption, and Kafka redelivery scenarios.

### Acceptance Criteria
- Duplicate work is detected before business execution
- Duplicate work is skipped safely
- Duplicate detection works for both primary and retry-topic consumption paths
- Duplicate handling is observable

### Dependencies
- None

## TASK-4: Add primary consumer retry routing
### Summary
Update the primary Kafka consumer flow so retryable failures are routed to the retry topic and non-retryable failures follow terminal failure handling.

### Acceptance Criteria
- Retryable failures are published to the retry topic
- Non-retryable failures do not enter the retry topic
- Routing behavior is logged appropriately

### Dependencies
- TASK-1
- TASK-2

## TASK-5: Add retry-topic consumer handling
### Summary
Implement consumption of retry-topic messages and re-entry into campaign execution with safe duplicate protection and consistent failure handling.

### Acceptance Criteria
- Retry-topic messages are consumed successfully
- Retry-topic execution path uses idempotency protection
- Retry-topic failures are handled consistently
- Retry-topic activity is observable

### Dependencies
- TASK-1
- TASK-3
- TASK-4

## TASK-6: Add dead-letter routing for terminal failures
### Summary
Route terminal failures to the dead-letter path from both the primary and retry-topic flows where appropriate.

### Acceptance Criteria
- Non-retryable failures can be dead-lettered where appropriate
- Exhausted retry-topic failures are dead-lettered
- Dead-letter outcomes are logged and measurable

### Dependencies
- TASK-4
- TASK-5

## TASK-7: Add observability for retry, duplicate, and dead-letter outcomes
### Summary
Add logs and metrics for retry routing, retry-topic execution, duplicate skip outcomes, and dead-letter activity.

### Acceptance Criteria
- Retry routing is logged
- Retry-topic processing is logged
- Duplicate skip activity is observable
- Dead-letter outcomes are observable
- Metrics exist for key retry and failure outcomes

### Dependencies
- TASK-4
- TASK-5
- TASK-6

## TASK-8: Add automated tests for retry and duplicate-handling behavior
### Summary
Add tests that validate classification, retry-topic routing, duplicate protection, and dead-letter behavior.

### Acceptance Criteria
- Retryable and non-retryable failure paths are covered
- Duplicate-processing protection is covered
- Dead-letter behavior is covered
- Test coverage is sufficient to support production rollout

### Dependencies
- TASK-2
- TASK-3
- TASK-4
- TASK-5
- TASK-6
```

This is now the list I would actually take to Jira.

---

# 20. Generate final technical task prompts one last time

Now that the Jira list is stable, I want the technical prompts aligned with it.

## Console

```bash
spec-forge run task-prompt --project comm-service --feature campaign-retry --version v2
```

## System

```text
Generating: task-prompt.new.md
Showing diff against task-prompt.md
Replace task-prompt.md? (y/n)
```

## Me

```text
y
```

Now I have a business-friendly Jira task list and technical AI guidance for each task.

---

# 21. What the final state looks like

## Final folder structure

```text
spec-forge/output/comm-service/campaign-retry/
  v1/
    user-input.md
    requirements.md
    architecture.md
    jira-task.md
    task-prompt.md
  v2/
    user-input.md
    requirements.md
    architecture.md
    jira-task.md
    task-prompt.md
  analysis-v1-v2.md
  analysis-v1-v2.json
```

## My actual final working state

* `v1` = original design snapshot
* `v2` = improved, final design
* `analysis-v1-v2.*` = safe impact report
* `v2/jira-task.md` = final backlog source
* `v2/task-prompt.md` = implementation guidance source

---

# 22. What this feels like in practice

The important part is that I did **not**:

* try to get the perfect design in one shot
* overwrite tasks blindly
* lose track of earlier assumptions
* mix business tasks with technical execution details

Instead, I:

* started with rough input
* generated a first draft
* edited requirements manually
* regenerated downstream artifacts
* harvested team knowledge
* promoted a useful pattern
* created a new version when root requirements changed
* compared versions safely
* finalized the Jira list only after the design stabilized

---

# 23. The condensed day-to-day pattern

In real life, the loop looks like this:

## Start

```bash
spec-forge run spec-to-tasks --project comm-service --feature campaign-retry
```

## Refine

```bash
spec-forge run architecture --project comm-service --feature campaign-retry --version v1
spec-forge run jira-task --project comm-service --feature campaign-retry --version v1
spec-forge run task-prompt --project comm-service --feature campaign-retry --version v1
```

## Learn

```bash
spec-forge harvest comm-service
spec-forge promote kafka-idempotent-consumer
```

## Evolve

```bash
spec-forge run spec-to-tasks --project comm-service --feature campaign-retry
spec-forge analyze-change comm-service campaign-retry v1 v2
```

## Finalize

Take `v2/jira-task.md` into Jira.

---

# 24. Final mental model

Spec Forge is not “generate docs once.”

It is:

```text
rough idea
→ draft spec
→ manual refinement
→ regenerated architecture
→ regenerated tasks
→ new requirement
→ new version
→ change analysis
→ final Jira list
```

That is what makes it usable.

If you want, the next thing I can do is turn this exact walkthrough into a **formal “How To” document** or into a **worked sample repository structure with full example files**.
