import type { ConfigContext } from "../config/types";
import { executeWithRetry } from "./executeWithRetry";
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "./ProviderAdapter";
import { resolveWorkingDir } from "./resolveWorkingDir";

export class ProviderUnavailableError extends Error {
  constructor(providerName: string) {
    super(`Active provider '${providerName}' is not available.`);
    this.name = "ProviderUnavailableError";
  }
}

export async function runProviderCall(
  adapter: ProviderAdapter,
  request: ProviderRequest,
  context: ConfigContext,
): Promise<ProviderResponse> {
  const available = await adapter.isAvailable();

  if (!available) {
    throw new ProviderUnavailableError(adapter.name);
  }

  return executeWithRetry({
    adapter,
    request: {
      ...request,
      workingDirectory: resolveWorkingDir(context),
    },
  });
}
