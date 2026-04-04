import { logger } from "../logging/logger";
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "./ProviderAdapter";

interface ExecuteWithRetryInput {
  adapter: ProviderAdapter;
  request: ProviderRequest;
  runAttempt?: (request: ProviderRequest, signal: AbortSignal) => Promise<ProviderResponse>;
}

function hasUnresolvedVariables(prompt: string): boolean {
  return /\{\{[^}]+\}\}/.test(prompt);
}

async function runWithTimeout(
  adapter: ProviderAdapter,
  request: ProviderRequest,
  runAttempt: (request: ProviderRequest, signal: AbortSignal) => Promise<ProviderResponse>,
): Promise<ProviderResponse> {
  const startedAt = Date.now();
  const controller = new AbortController();

  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<ProviderResponse>((resolve) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      logger.info(`Provider call timed out after ${request.timeoutMs}ms for ${adapter.name}.`);
      resolve({
        provider: adapter.name,
        stdout: "",
        stderr: `Timed out after ${request.timeoutMs}ms.`,
        exitCode: 1,
        durationMs: Date.now() - startedAt,
        timedOut: true,
      });
    }, request.timeoutMs);
  });

  const attemptPromise = runAttempt(request, controller.signal)
    .then((response) => ({ ...response, timedOut: false }))
    .catch((error: unknown) => ({
      provider: adapter.name,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
      durationMs: Date.now() - startedAt,
      timedOut: false,
    } satisfies ProviderResponse));

  const result = await Promise.race([attemptPromise, timeoutPromise]);

  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }

  return result;
}

export async function executeWithRetry(input: ExecuteWithRetryInput): Promise<ProviderResponse> {
  const { adapter, request } = input;
  const runAttempt =
    input.runAttempt ??
    (async (req: ProviderRequest): Promise<ProviderResponse> => {
      return adapter.generate(req);
    });

  if (request.prompt.trim().length === 0) {
    logger.info("Provider request failed: empty prompt.");
    return {
      provider: adapter.name,
      stdout: "",
      stderr: "Prompt is empty.",
      exitCode: 1,
      durationMs: 0,
      timedOut: false,
    };
  }

  if (hasUnresolvedVariables(request.prompt)) {
    logger.info("Provider request failed: unresolved template variables in prompt.");
    return {
      provider: adapter.name,
      stdout: "",
      stderr: "Prompt contains unresolved variables.",
      exitCode: 1,
      durationMs: 0,
      timedOut: false,
    };
  }

  const first = await runWithTimeout(adapter, request, runAttempt);

  if (first.timedOut) {
    return first;
  }

  if (first.exitCode === 0) {
    return first;
  }

  logger.info(`Retrying provider call for ${adapter.name} after non-zero exit code ${first.exitCode}.`);
  const second = await runWithTimeout(adapter, request, runAttempt);
  return second;
}
