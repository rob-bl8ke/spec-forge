import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import {
  type ConfigContext,
  type ResolvedProjectConfig,
} from "./types";
import { validateGlobalConfig, validateProjectConfig } from "./validateConfig";

interface LoadConfigInput {
  cwd?: string;
  projectName?: string;
}

function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}

async function readYamlFile(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  return parse(raw);
}

export async function findSpecForgeRoot(startDir: string): Promise<string> {
  let currentDir = path.resolve(startDir);

  while (true) {
    const configPath = path.join(currentDir, "config.yaml");

    try {
      await access(configPath);
      return currentDir;
    } catch {
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        throw new Error(
          `Could not find config.yaml by walking up from ${normalizePath(startDir)}. Run this command inside a spec-forge workspace.`,
        );
      }

      currentDir = parentDir;
    }
  }
}

export async function loadConfig(input: LoadConfigInput = {}): Promise<ConfigContext> {
  const cwd = input.cwd ?? process.cwd();
  const rootDir = await findSpecForgeRoot(cwd);

  const globalConfigPath = path.join(rootDir, "config.yaml");
  const globalRaw = await readYamlFile(globalConfigPath);
  const globalConfig = validateGlobalConfig(globalRaw, globalConfigPath);

  if (!input.projectName) {
    return {
      rootDir,
      globalConfig,
      resolvedProvider: globalConfig.provider.active,
    };
  }

  const projectConfigPath = path.join(rootDir, "projects", `${input.projectName}.yaml`);

  let projectRaw: unknown;
  try {
    projectRaw = await readYamlFile(projectConfigPath);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load project config ${normalizePath(projectConfigPath)}: ${message}`,
    );
  }

  const projectConfig = await validateProjectConfig(projectRaw, projectConfigPath, rootDir);
  const resolvedProvider = projectConfig.provider ?? globalConfig.provider.active;

  const resolvedProject: ResolvedProjectConfig = {
    ...projectConfig,
    provider: resolvedProvider,
    providerTimeoutMs: globalConfig.provider.timeoutMs,
    logging: globalConfig.logging,
  };

  return {
    rootDir,
    globalConfig,
    projectConfig,
    resolvedProject,
    resolvedProvider,
  };
}
