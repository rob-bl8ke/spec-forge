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

  private checkCommandAvailable(command: string, args: string[]): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const child = this.spawnFn(command, args, { stdio: "pipe" });

      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });
  }

  private runCommand(
    command: string,
    args: string[],
    request: ProviderRequest,
  ): Promise<ProviderResponse> {
    const startedAt = Date.now();

    return new Promise<ProviderResponse>((resolve) => {
      let stdout = "";
      let stderr = "";

      const child = this.spawnFn(command, args, {
        cwd: request.workingDirectory,
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });

      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });

      child.on("error", (error) => {
        const nodeError = error as NodeJS.ErrnoException;
        resolve({
          provider: this.name,
          stdout,
          stderr: `${stderr}${error.message}`,
          exitCode: nodeError.code === "ENOENT" ? 127 : 1,
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
    });
  }

  async isAvailable(): Promise<boolean> {
    const standalone = await this.checkCommandAvailable("copilot", ["--help"]);
    if (standalone) return true;

    return this.checkCommandAvailable("gh", ["copilot", "--", "--help"]);
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const promptArgs = ["--prompt", request.prompt, "-s", "--no-ask-user"];

    const result = await this.runCommand("copilot", promptArgs, request);

    if (result.exitCode === 127) {
      return this.runCommand("gh", ["copilot", "--", ...promptArgs], request);
    }

    return result;
  }
}
