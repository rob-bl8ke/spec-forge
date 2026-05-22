import { Command } from "commander";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { findSpecForgeRoot } from "../config/loadConfig";

const WORKSPACE_DIRS = [
  "prompts",
  "workflows",
  "skills",
  "instructions",
  "knowledge",
  "projects",
  "output",
  ".logs",
  path.join("harvested", "patterns"),
  path.join("harvested", "candidate-skills"),
  path.join("harvested", "reports"),
];

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .argument("<project-name>", "Project name")
    .requiredOption("--repo <path>", "Path to the target repository")
    .description("Initialize a project configuration")
    .action(async (projectName: string, options: { repo: string }) => {
      const cwd = process.cwd();
      let rootDir: string;

      try {
        rootDir = await findSpecForgeRoot(cwd);
      } catch {
        rootDir = cwd;
        await scaffoldWorkspace(rootDir);
        console.log(`Initialized new spec-forge workspace at: ${rootDir}`);
      }

      await initializeProjectConfig({
        rootDir,
        projectName,
        repoPathInput: options.repo,
        cwd,
      });
      console.log(`Project initialized: ${projectName}`);
    });
}

function buildDefaultGlobalConfigYaml(): string {
  return `provider:
  active: copilot
  timeoutMs: 120000

logging:
  level: info
  writePromptFiles: true
`;
}

export async function scaffoldWorkspace(rootDir: string): Promise<void> {
  const configPath = path.join(rootDir, "config.yaml");
  await writeFile(configPath, buildDefaultGlobalConfigYaml(), "utf8");

  for (const dir of WORKSPACE_DIRS) {
    await mkdir(path.join(rootDir, dir), { recursive: true });
  }

  const defaultWorkflowPath = path.join(rootDir, "workflows", "spec-to-tasks.yaml");
  await writeFile(defaultWorkflowPath, buildDefaultSpecToTasksWorkflow(), "utf8");
}

function buildDefaultSpecToTasksWorkflow(): string {
  return `id: spec-to-tasks
description: Generate implementation artifacts from a feature description

steps:
  - id: requirements
    prompt: |
      You are a software architect. Generate a technical requirements document for the following feature.

      Project: {{ project_name }}
      Feature: {{ feature_name }}

      {{ user_input }}

      You MUST use exactly these headings in this order:

      # Requirements
      ## Feature Summary
      ## Functional Requirements
      ## Non-Functional Requirements
      ## Constraints
      ## Assumptions
      ## Open Questions

      Respond only with the requirements document in Markdown format.
    output: requirements

  - id: architecture
    prompt: |
      You are a software architect. Based on the requirements below, generate a technical architecture document.

      Project: {{ project_name }}
      Feature: {{ feature_name }}

      ## Requirements

      {{ requirements }}

      You MUST use exactly these headings in this order:

      # Architecture
      ## Overview
      ## Components
      ## Data Flow
      ## Key Design Decisions
      ## Failure Handling
      ## Observability
      ## Risks and Trade-offs

      Respond only with the architecture document in Markdown format.
    input:
      - requirements
    output: architecture

  - id: jira-task
    prompt: |
      You are a technical project manager. Based on the requirements and architecture below, generate Jira tasks.

      Project: {{ project_name }}
      Feature: {{ feature_name }}

      ## Requirements

      {{ requirements }}

      ## Architecture

      {{ architecture }}

      You MUST use exactly this structure:

      # Tasks
      ## TASK-1: <short summary>
      **Description:** ...
      **Acceptance Criteria:**
      - ...
      **Technical Notes:** ...

      Add more TASK-N sections as needed. Respond only with the tasks in Markdown format.
    input:
      - requirements
      - architecture
    output: jira-task

  - id: task-prompt
    prompt: |
      You are a senior engineer writing detailed implementation prompts for a coding agent.

      Based on the following Jira tasks, write a step-by-step implementation prompt for each task.

      ## Jira Tasks

      {{ jira_task }}

      You MUST use exactly this structure:

      # Task Prompts
      ## TASK-1
      <detailed implementation prompt>

      Add a ## TASK-N section for each task. Respond only with the task prompts in Markdown format.
    input:
      - jira-task
    output: task-prompt
`;
}

interface InitializeProjectConfigInput {
  rootDir: string;
  projectName: string;
  repoPathInput: string;
  cwd: string;
}

function buildDefaultProjectYaml(projectName: string, repoPathInput: string): string {
  return `name: ${projectName}
repoPath: ${repoPathInput}

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
    - .ts
    - .js
  minChangedLines: 10
  maxChangedLines: 400
  probes:
    - resilience
    - auth
    - logging
`;
}

export async function initializeProjectConfig(input: InitializeProjectConfigInput): Promise<string> {
  const resolvedRepoPath = path.resolve(input.cwd, input.repoPathInput);

  try {
    await access(resolvedRepoPath);
  } catch {
    await mkdir(resolvedRepoPath, { recursive: true });
  }

  const projectsDir = path.join(input.rootDir, "projects");
  await mkdir(projectsDir, { recursive: true });

  const projectConfigPath = path.join(projectsDir, `${input.projectName}.yaml`);

  try {
    await access(projectConfigPath);
    throw new Error(`Project config already exists: ${path.normalize(projectConfigPath)}.`);
  } catch (error: unknown) {
    if (error instanceof Error && !error.message.includes("already exists")) {
      // Access failed because the target file does not exist yet.
    } else if (error instanceof Error) {
      throw error;
    }
  }

  const content = buildDefaultProjectYaml(input.projectName, input.repoPathInput);
  await writeFile(projectConfigPath, content, "utf8");
  return projectConfigPath;
}
