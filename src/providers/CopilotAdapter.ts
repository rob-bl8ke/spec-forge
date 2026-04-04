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

  async isAvailable(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const child = this.spawnFn("gh", ["copilot", "--help"], { stdio: "pipe" });

      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const startedAt = Date.now();

    return new Promise<ProviderResponse>((resolve) => {
      let stdout = "";
      let stderr = "";

      const child = this.spawnFn("gh", ["copilot", "suggest"], {
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
        resolve({
          provider: this.name,
          stdout,
          stderr: `${stderr}${error.message}`,
          exitCode: 1,
          durationMs: Date.now() - startedAt,
          timedOut: false,
        });
      });

      child.on("close", (code) => {
        resolve({
          provider: this.name,
          stdout,
          stderr,
          exitCode: code ?? 1,
          durationMs: Date.now() - startedAt,
          timedOut: false,
        });
      });

      child.stdin?.write(request.prompt);
      child.stdin?.end();
    });
  }
}
