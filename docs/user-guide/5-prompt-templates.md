# 5. 🧠 Understanding Prompt Templates (How It Actually Works)

This section explains **exactly how Spec Forge uses prompts**, how variables are filled, and how everything connects.



# 5.1 🧩 The Big Picture

Every time you run:

```bash
spec-forge run spec-to-tasks
```

Spec Forge does **NOT “think” on its own** — it:

> **Executes a series of prompt templates defined in a workflow**



## The relationship

```text
Workflow → Steps → Prompt Templates → Variables → Final Prompt → AI → Output File
```



# 5.2 🔗 How Workflows, Steps, and Prompts Connect

## Example workflow

```yaml
steps:
  - id: requirements
    prompt: prompts/spec-to-tasks/requirements.md
    output: requirements.md

  - id: architecture
    prompt: prompts/spec-to-tasks/architecture.md
    input: requirements
    output: architecture.md
```



## What this means

### Step 1 — requirements

* uses: `prompts/spec-to-tasks/requirements.md`
* takes: **user input**
* produces: `requirements.md`



### Step 2 — architecture

* uses: `prompts/spec-to-tasks/architecture.md`
* takes: `requirements.md` as input
* produces: `architecture.md`



## 🔥 Key idea

> Each step = one prompt template + some inputs → one output file



# 5.3 📄 What a Prompt Template Is

A prompt template is just a **Markdown file with placeholders**.



## Example template

```md
You are a senior backend architect.

Requirements:
{{requirements}}

Design a production-ready architecture.
```



## Placeholders (variables)

```text
{{requirements}}
```

These are **filled in at runtime** by Spec Forge.



# 5.4 ⚙️ How Variables Are Filled

Spec Forge replaces variables using **real data from your workflow run**.



## Variable types

### 1. User input

```text
{{user_input}}
```

Filled from what you type when prompted.



### 2. Previous step outputs

| Variable         | Comes from      |
| - |  |
| {{requirements}} | requirements.md |
| {{architecture}} | architecture.md |
| {{jira_task}}    | jira-task.md    |



### Example

If `requirements.md` contains:

```md
Retry failed Kafka messages with idempotency.
```

Then:

```text
{{requirements}}
```

becomes:

```text
Retry failed Kafka messages with idempotency.
```



### 3. Assets (skills, instructions, knowledge)

These come from your project config:

```yaml
assets:
  skills:
    - kafka-patterns
```

Spec Forge loads:

```text
spec-forge/skills/kafka-patterns.md
```

and injects it into the prompt.



# 5.5 🧱 How the Final Prompt Is Built

Spec Forge builds the **actual prompt sent to the AI** like this:



## Step 1 — Start with template

```text
You are a senior backend architect.

Requirements:
{{requirements}}
```



## Step 2 — Replace variables

```text
You are a senior backend architect.

Requirements:
Retry failed Kafka messages with idempotency.
```



## Step 3 — Add context sections

```text
You are a senior backend architect.

Requirements:
Retry failed Kafka messages with idempotency.

 CONTEXT: ARTIFACTS 

# requirements
Retry failed Kafka messages with idempotency.

 SKILLS 

# kafka-patterns
[skill content here]
```



## Step 4 — Send to AI

This final text is what gets sent to:

* Copilot CLI or
* Claude CLI



# 5.6 🔁 How Data Flows Between Steps

Each step builds on the previous one.



## Flow example

```text
User input
  ↓
requirements.md
  ↓
architecture.md
  ↓
jira-task.md
  ↓
task-prompt.md
```



## Important

> Variables like `{{requirements}}` are populated from files generated earlier in the workflow



# 5.7 🧠 Why This Matters

This design gives you full control:



## You control behavior by editing:

| File              | Controls                    |
| -- |  |
| prompts/*.md      | how the AI thinks           |
| workflows/*.yaml  | what runs and in what order |
| skills/*.md       | reusable patterns           |
| instructions/*.md | rules for the AI            |



## You do NOT need to change code

To change behavior, you:

* edit prompt templates
* rerun the workflow



# 5.8 ⚠️ Common Pitfalls



## ❌ Mistake: expecting automatic context

If your prompt does NOT include:

```text
{{requirements}}
```

→ the AI will NOT see it



## ❌ Mistake: duplicate input

Do NOT manually paste requirements into prompts — let variables handle it



## ❌ Mistake: missing variables

If a variable cannot be resolved:

```text
Error: Missing variable {{architecture}}
```



# 5.9 🔥 Mental Model (Keep This)

> Prompt templates are **instructions with placeholders**
>
> Workflow steps decide **when they run**
>
> Spec Forge fills in **real data**
>
> The AI executes the **final composed prompt**



# 🏁 Summary

* Prompts = templates with variables
* Workflows = define execution order
* Variables = filled from previous outputs or user input
* Spec Forge = builds the final prompt and sends it to the AI



If you understand this, you understand the **core engine of Spec Forge**.
