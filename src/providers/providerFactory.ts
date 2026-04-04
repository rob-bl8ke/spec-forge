import type { ProviderName } from "../config/types";
import type { ConfigContext } from "../config/types";
import type { ProviderAdapter } from "./ProviderAdapter";

const registry = new Map<ProviderName, ProviderAdapter>();

export function registerProvider(adapter: ProviderAdapter): void {
  registry.set(adapter.name, adapter);
}

export function registerProviders(adapters: ProviderAdapter[]): void {
  for (const adapter of adapters) {
    registerProvider(adapter);
  }
}

export function resolveProvider(activeProvider: ProviderName): ProviderAdapter {
  const adapter = registry.get(activeProvider);

  if (!adapter) {
    throw new Error(`No provider adapter registered for '${activeProvider}'.`);
  }

  return adapter;
}

export function resolveProviderFromContext(context: ConfigContext): ProviderAdapter {
  return resolveProvider(context.resolvedProvider);
}

export function clearProviderRegistry(): void {
  registry.clear();
}
