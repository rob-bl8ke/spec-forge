import { access } from "node:fs/promises";
import path from "node:path";
import type { GlobalConfig, ProjectConfig, ProviderName } from "./types";

type UnknownRecord = Record<string, unknown>;

const VALID_PROVIDERS: ProviderName[] = ["copilot", "claude"];

export class ConfigValidationError extends Error {
  readonly filePath: string;
  readonly field: string;

  constructor(filePath: string, field: string, reason: string) {
    super(`Invalid config at ${path.normalize(filePath)}: ${field} ${reason}`);
    this.name = "ConfigValidationError";
    this.filePath = path.normalize(filePath);
    this.field = field;
  }
}

function asRecord(value: unknown, filePath: string): UnknownRecord {
  if (typeof value !== "object" || value === null) {
    throw new ConfigValidationError(filePath, "root", "must be an object.");
  }

  return value as UnknownRecord;
}

function readRequiredString(obj: UnknownRecord, field: string, filePath: string): string {
  const value = obj[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ConfigValidationError(filePath, field, "must be a non-empty string.");
  }

  return value;
}

function readRequiredNumber(obj: UnknownRecord, field: string, filePath: string): number {
  const value = obj[field];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ConfigValidationError(filePath, field, "must be a number.");
  }

  return value;
}

function readRequiredBoolean(obj: UnknownRecord, field: string, filePath: string): boolean {
  const value = obj[field];
  if (typeof value !== "boolean") {
    throw new ConfigValidationError(filePath, field, "must be a boolean.");
  }

  return value;
}

function readProvider(value: unknown, field: string, filePath: string): ProviderName {
  if (typeof value !== "string") {
    throw new ConfigValidationError(filePath, field, "must be set to copilot or claude.");
  }

  if (!VALID_PROVIDERS.includes(value as ProviderName)) {
    throw new ConfigValidationError(filePath, field, "must be one of copilot or claude.");
  }

  return value as ProviderName;
}

export function validateGlobalConfig(raw: unknown, filePath: string): GlobalConfig {
  const root = asRecord(raw, filePath);
  const provider = asRecord(root.provider, filePath);
  const logging = asRecord(root.logging, filePath);

  return {
    provider: {
      active: readProvider(provider.active, "provider.active", filePath),
      timeoutMs: readRequiredNumber(provider, "timeoutMs", filePath),
      model: typeof provider.model === "string" ? provider.model : undefined,
    },
    logging: {
      level: readRequiredString(logging, "level", filePath),
      writePromptFiles: readRequiredBoolean(logging, "writePromptFiles", filePath),
    },
  };
}

export async function validateProjectConfig(raw: unknown, filePath: string, rootDir?: string): Promise<ProjectConfig> {
  const root = asRecord(raw, filePath);
  const name = readRequiredString(root, "name", filePath);
  const repoPath = readRequiredString(root, "repoPath", filePath);

  if (root.provider !== undefined) {
    readProvider(root.provider, "provider", filePath);
  }

  if (root.model !== undefined && typeof root.model !== "string") {
    throw new ConfigValidationError(filePath, "model", "must be a string.");
  }

  const resolvedRepoPath = path.resolve(rootDir ?? path.dirname(filePath), repoPath);
  try {
    await access(resolvedRepoPath);
  } catch {
    throw new ConfigValidationError(filePath, "repoPath", `does not exist on disk: ${path.normalize(resolvedRepoPath)}.`);
  }

  if (root.sync !== undefined) {
    const sync = asRecord(root.sync, filePath);
    if (sync.overwritePolicy !== undefined && sync.overwritePolicy !== "prompt") {
      throw new ConfigValidationError(filePath, "sync.overwritePolicy", "must be prompt for MVP.");
    }
    if (sync.targets !== undefined) {
      const targets = asRecord(sync.targets, filePath);
      for (const key of ["skills", "instructions", "knowledge"]) {
        if (targets[key] !== undefined && typeof targets[key] !== "string") {
          throw new ConfigValidationError(filePath, `sync.targets.${key}`, "must be a string.");
        }
      }
    }
  }

  return {
    ...(root as unknown as ProjectConfig),
    name,
    repoPath,
    provider: root.provider as ProviderName | undefined,
  };
}
