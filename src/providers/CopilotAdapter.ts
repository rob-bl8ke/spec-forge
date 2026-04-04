import { spawn, type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "./ProviderAdapter";

type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => {
  stdout?: EventEmitter;
  stderr?: EventEmitter;
  stdin?: {
    write(chunk: string): void;
    end(): void;
  };
  on(event: "close", listener: (code: number | null) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
};

export class CopilotAdapter implements ProviderAdapter {
  readonly name = "copilot" as const;
  private readonly spawnFn: SpawnFn;

  constructor(spawnFn: SpawnFn = spawn as unknown as SpawnFn) {
    this.spawnFn = spawnFn;
  }

  private async checkCommandAvailable(command: string, args: string[]): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const child = this.spawnFn(command, args, { stdio: "pipe" });

      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });
  }

  private async runCommand(
    command: string,
    args: string[],
    request: ProviderRequest,
  ): Promise<{ response: ProviderResponse; spawnErrorCode?: string }> {
    const startedAt = Date.now();

    return new Promise<{ response: ProviderResponse; spawnErrorCode?: string }>((resolve) => {
      let stdout = "";
      let stderr = "";
      let spawnErrorCode: string | undefined;

      const child = this.spawnFn(command, args, {
        cwd: request.workingDirectory,
        stdio: "pipe",
      });

      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });

      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });

      child.on("error", (error) => {
        const nodeError = error as NodeJS.ErrnoException;
        spawnErrorCode = nodeError.code;
        resolve({
          response: {
            provider: this.name,
            stdout,
            stderr: `${stderr}${error.message}`,
            exitCode: 1,
            durationMs: Date.now() - startedAt,
            timedOut: false,
          },
          spawnErrorCode,
        });
      });

      child.on("close", (code) => {
        resolve({
          response: {
            provider: this.name,
            stdout,
            stderr,
            exitCode: code ?? 1,
            durationMs: Date.now() - startedAt,
            timedOut: false,
          },
          spawnErrorCode,
        });
      });
    });
  }

  async isAvailable(): Promise<boolean> {
    const standaloneAvailable = await this.checkCommandAvailable("copilot", ["--help"]);
    if (standaloneAvailable) {
      return true;
    }

    return this.checkCommandAvailable("gh", ["copilot", "--", "--help"]);
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const standaloneArgs = ["--prompt", request.prompt, "--allow-all-tools", "--silent"];
    const standaloneResult = await this.runCommand("copilot", standaloneArgs, request);
    if (standaloneResult.spawnErrorCode !== "ENOENT") {
      return standaloneResult.response;
    }

    const ghFallbackArgs = [
      "copilot",
      "--",
      "--prompt",
      request.prompt,
      "--allow-all-tools",
      "--silent",
    ];
    const ghResult = await this.runCommand("gh", ghFallbackArgs, request);
    return ghResult.response;
  }
}
