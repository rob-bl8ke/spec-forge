import { Command } from "commander";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { findSpecForgeRoot } from "../config/loadConfig";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .argument("<project-name>", "Project name")
    .requiredOption("--repo <path>", "Path to the target repository")
    .description("Initialize a project configuration")
    .action(async (projectName: string, options: { repo: string }) => {
      const rootDir = await findSpecForgeRoot(process.cwd());
      await initializeProjectConfig({
        rootDir,
        projectName,
        repoPathInput: options.repo,
        cwd: process.cwd(),
      });
      console.log(`Project initialized: ${projectName}`);
    });
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
    throw new Error(`Invalid --repo path: ${path.normalize(resolvedRepoPath)} does not exist.`);
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
