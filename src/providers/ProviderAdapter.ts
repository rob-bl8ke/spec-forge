import type { ProviderName } from "../config/types";

export interface ProviderRequest {
  prompt: string;
  workingDirectory?: string;
  timeoutMs: number;
  model?: string;
}

export interface ProviderResponse {
  provider: ProviderName;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
}

export interface ProviderAdapter {
  name: ProviderName;
  isAvailable(): Promise<boolean>;
  generate(request: ProviderRequest): Promise<ProviderResponse>;
}

export function isSuccessful(response: ProviderResponse): boolean {
  return response.exitCode === 0 && !response.timedOut && response.stdout.trim().length > 0;
}
