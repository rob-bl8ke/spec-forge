import { spawn, type SpawnOptions } from "node:child_process";
import { dirname, join } from "node:path";
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
  ): Promise<ProviderResponse> {
    const startedAt = Date.now();

    return new Promise<ProviderResponse>((resolve) => {
      let stdout = "";
      let stderr = "";

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

  /**
   * On Windows, `spawn('copilot', ...)` fails with ENOENT because Node cannot
   * execute `.cmd` wrappers without a shell. Instead, invoke Node.js directly
   * with the copilot npm-loader that the `.cmd` wrapper delegates to, using
   * the same Node.js binary that is running this process.
   */
  private resolveCopilotCommand(): { command: string; prefix: string[] } {
    if (process.platform === "win32") {
      const nodeDir = dirname(process.execPath);
      const loaderPath = join(nodeDir, "node_modules", "@github", "copilot", "npm-loader.js");
      return { command: process.execPath, prefix: [loaderPath] };
    }
    return { command: "copilot", prefix: [] };
  }

  async isAvailable(): Promise<boolean> {
    const { command, prefix } = this.resolveCopilotCommand();
    return this.checkCommandAvailable(command, [...prefix, "--help"]);
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const { command, prefix } = this.resolveCopilotCommand();
    const args = [...prefix, "--prompt", request.prompt, "--model", request.model ?? "gpt-4.1"];
    const result = await this.runCommand(command, args, request);
    return result;
  }
}
