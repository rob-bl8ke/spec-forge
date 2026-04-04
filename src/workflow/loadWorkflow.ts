import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { findSpecForgeRoot } from "../config/loadConfig";
import type { StepDefinition, WorkflowDefinition } from "./types";

type UnknownRecord = Record<string, unknown>;

export class WorkflowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowValidationError";
  }
}

function asRecord(value: unknown, context: string): UnknownRecord {
  if (typeof value !== "object" || value === null) {
    throw new WorkflowValidationError(`${context} must be an object.`);
  }

  return value as UnknownRecord;
}

function asString(value: unknown, field: string, filePath: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new WorkflowValidationError(`Invalid workflow at ${path.normalize(filePath)}: ${field} must be a non-empty string.`);
  }

  return value;
}

function parseInput(value: unknown, filePath: string, stepIndex: number): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0)) {
    return value;
  }

  throw new WorkflowValidationError(
    `Invalid workflow at ${path.normalize(filePath)}: steps[${stepIndex}].input must be a string or array of strings.`,
  );
}

function parseStep(value: unknown, filePath: string, index: number): StepDefinition {
  const step = asRecord(value, `steps[${index}]`);
  return {
    id: asString(step.id, `steps[${index}].id`, filePath),
    prompt: asString(step.prompt, `steps[${index}].prompt`, filePath),
    input: parseInput(step.input, filePath, index),
    output: asString(step.output, `steps[${index}].output`, filePath),
  };
}

export async function loadWorkflow(workflowId: string, cwd: string = process.cwd()): Promise<WorkflowDefinition> {
  const rootDir = await findSpecForgeRoot(cwd);
  const workflowPath = path.join(rootDir, "workflows", `${workflowId}.yaml`);

  let raw: string;
  try {
    raw = await readFile(workflowPath, "utf8");
  } catch {
    throw new Error(`Workflow file not found: ${path.normalize(workflowPath)}`);
  }

  const parsed = parse(raw);
  const root = asRecord(parsed, `workflow ${workflowId}`);

  const id = asString(root.id, "id", workflowPath);
  const stepsRaw = root.steps;
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
    throw new WorkflowValidationError(`Invalid workflow at ${path.normalize(workflowPath)}: steps must be a non-empty array.`);
  }

  const steps = stepsRaw.map((step, index) => parseStep(step, workflowPath, index));

  return {
    id,
    description: typeof root.description === "string" ? root.description : undefined,
    steps,
  };
}
