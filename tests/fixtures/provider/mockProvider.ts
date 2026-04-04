import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "../../../src/providers/ProviderAdapter";

export interface MockProviderController {
  adapter: ProviderAdapter;
  requests: ProviderRequest[];
}

export function createQueuedMockProvider(outputs: string[]): MockProviderController {
  const requests: ProviderRequest[] = [];
  const queue = [...outputs];

  const adapter: ProviderAdapter = {
    name: "copilot",
    async isAvailable(): Promise<boolean> {
      return true;
    },
    async generate(request: ProviderRequest): Promise<ProviderResponse> {
      requests.push(request);
      const stdout = queue.length > 0 ? queue.shift() ?? "" : "";
      return {
        provider: "copilot",
        stdout,
        stderr: "",
        exitCode: 0,
        durationMs: 1,
        timedOut: false,
      };
    },
  };

  return { adapter, requests };
}
