import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ProviderName } from "../config/types";

export type LogLevel = "info" | "debug";

export interface LogEntry {
  timestamp: string;
  command: string;
  project: string | null;
  feature: string | null;
  version: string | null;
  step: string | null;
  provider: ProviderName | null;
  durationMs: number;
  outcome: "success" | "failure";
  errorSummary?: string;
}

interface RunState {
  runId: string;
  rootDir: string;
  logsDir: string;
  command: string;
  project: string | null;
  feature: string | null;
  version: string | null;
  step: string | null;
  provider: ProviderName | null;
  startedAtMs: number;
  writePromptFiles: boolean;
  logLevel: LogLevel;
  promptContent?: string;
}

class LoggerSingleton {
  private state: RunState | undefined;

  async startCommand(input: {
    rootDir: string;
    command: string;
    project?: string;
    feature?: string;
    version?: string;
    step?: string;
    provider?: ProviderName;
    logLevel?: string;
    writePromptFiles?: boolean;
  }): Promise<void> {
    const logsDir = path.join(input.rootDir, ".logs");
    await mkdir(logsDir, { recursive: true });

    this.state = {
      runId: randomUUID(),
      rootDir: input.rootDir,
      logsDir,
      command: input.command,
      project: input.project ?? null,
      feature: input.feature ?? null,
      version: input.version ?? null,
      step: input.step ?? null,
      provider: input.provider ?? null,
      startedAtMs: Date.now(),
      writePromptFiles: input.writePromptFiles ?? false,
      logLevel: input.logLevel === "debug" ? "debug" : "info",
    };

    this.debug(`Starting command: ${input.command}`);
  }

  setPrompt(content: string): void {
    if (this.state) {
      this.state.promptContent = content;
    }
  }

  info(message: string): void {
    if (!this.state || this.state.logLevel === "info" || this.state.logLevel === "debug") {
      console.log(message);
    }
  }

  debug(message: string): void {
    if (this.state?.logLevel === "debug") {
      console.log(`[debug] ${message}`);
    }
  }

  async endCommand(outcome: "success" | "failure", errorSummary?: string): Promise<void> {
    if (!this.state) {
      return;
    }

    const endedAt = Date.now();
    const entry: LogEntry = {
      timestamp: new Date(endedAt).toISOString(),
      command: this.state.command,
      project: this.state.project,
      feature: this.state.feature,
      version: this.state.version,
      step: this.state.step,
      provider: this.state.provider,
      durationMs: endedAt - this.state.startedAtMs,
      outcome,
      ...(errorSummary ? { errorSummary } : {}),
    };

    const runLogPath = path.join(this.state.logsDir, `${this.state.runId}.json`);
    const aggregatePath = path.join(this.state.logsDir, "command-runs.ndjson");

    await writeFile(runLogPath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
    await appendFile(aggregatePath, `${JSON.stringify(entry)}\n`, "utf8");

    if (this.state.writePromptFiles) {
      const promptFilePath = path.join(this.state.logsDir, `${this.state.runId}.prompt.md`);
      const promptBody = this.state.promptContent ?? "No composed prompt was captured for this command.";
      await writeFile(promptFilePath, promptBody, "utf8");
    }

    if (this.state.logLevel === "debug") {
      console.log(`[debug] command telemetry: ${JSON.stringify(entry)}`);
    }

    this.state = undefined;
  }
}

export const logger = new LoggerSingleton();
