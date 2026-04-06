export type ProviderName = "copilot" | "claude";

export interface GlobalConfig {
  provider: {
    active: ProviderName;
    timeoutMs: number;
    model?: string;
  };
  logging: {
    level: string;
    writePromptFiles: boolean;
  };
}

export interface ProjectConfig {
  name: string;
  repoPath: string;
  provider?: ProviderName;
  model?: string;
  workflowDefaults?: {
    defaultWorkflow?: string;
  };
  assets?: {
    skills?: string[];
    instructions?: string[];
    knowledge?: string[];
  };
  sync?: {
    targetDir?: string;
    previewByDefault?: boolean;
    overwritePolicy?: string;
  };
  harvest?: {
    enabled?: boolean;
    commitWindow?: number;
    excludeAuthors?: string[];
    includeExtensions?: string[];
    minChangedLines?: number;
    maxChangedLines?: number;
    probes?: string[];
  };
}

export interface ResolvedProjectConfig extends ProjectConfig {
  provider: ProviderName;
  providerTimeoutMs: number;
  logging: GlobalConfig["logging"];
}

export interface ConfigContext {
  rootDir: string;
  globalConfig: GlobalConfig;
  projectConfig?: ProjectConfig;
  resolvedProject?: ResolvedProjectConfig;
  resolvedProvider: ProviderName;
}
