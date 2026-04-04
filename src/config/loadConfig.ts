import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import {
  type ConfigContext,
  type GlobalConfig,
  type ProjectConfig,
  type ProviderName,
  type ResolvedProjectConfig,
} from "./types";

interface LoadConfigInput {
  cwd?: string;
  projectName?: string;
}

function isProviderName(value: unknown): value is ProviderName {
  return value === "copilot" || value === "claude";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}

async function readYamlFile(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  return parse(raw);
}

function ensureString(value: unknown, field: string, filePath: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid config at ${normalizePath(filePath)}: ${field} must be a non-empty string.`);
  }

  return value;
}

function ensureBoolean(value: unknown, field: string, filePath: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid config at ${normalizePath(filePath)}: ${field} must be a boolean.`);
  }

  return value;
}

function ensureNumber(value: unknown, field: string, filePath: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid config at ${normalizePath(filePath)}: ${field} must be a number.`);
  }

  return value;
}

export function parseGlobalConfig(raw: unknown, filePath: string): GlobalConfig {
  if (!isRecord(raw)) {
    throw new Error(`Invalid config at ${normalizePath(filePath)}: root must be an object.`);
  }

  const provider = raw.provider;
  if (!isRecord(provider)) {
    throw new Error(`Invalid config at ${normalizePath(filePath)}: provider is required.`);
  }

  const active = provider.active;
  if (!isProviderName(active)) {
    throw new Error(
      `Invalid config at ${normalizePath(filePath)}: provider.active must be one of copilot or claude.`,
    );
  }

  const logging = raw.logging;
  if (!isRecord(logging)) {
    throw new Error(`Invalid config at ${normalizePath(filePath)}: logging is required.`);
  }

  return {
    provider: {
      active,
      timeoutMs: ensureNumber(provider.timeoutMs, "provider.timeoutMs", filePath),
    },
    logging: {
      level: ensureString(logging.level, "logging.level", filePath),
      writePromptFiles: ensureBoolean(logging.writePromptFiles, "logging.writePromptFiles", filePath),
    },
  };
}

export function parseProjectConfig(raw: unknown, filePath: string): ProjectConfig {
  if (!isRecord(raw)) {
    throw new Error(`Invalid config at ${normalizePath(filePath)}: root must be an object.`);
  }

  const name = ensureString(raw.name, "name", filePath);
  const providerRaw = raw.provider;

  if (providerRaw !== undefined && !isProviderName(providerRaw)) {
    throw new Error(
      `Invalid config at ${normalizePath(filePath)}: provider must be one of copilot or claude when provided.`,
    );
  }

  return {
    ...(raw as unknown as ProjectConfig),
    name,
    provider: providerRaw,
  };
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
  const globalConfig = parseGlobalConfig(globalRaw, globalConfigPath);

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

  const projectConfig = parseProjectConfig(projectRaw, projectConfigPath);
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
