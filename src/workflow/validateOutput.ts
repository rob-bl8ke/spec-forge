import { writeFile } from "node:fs/promises";
import path from "node:path";
import { artifactFileName } from "../utils/naming";
import { logger } from "../logging/logger";

const requiredHeadingsByStep: Record<string, string[]> = {
  requirements: [
    "# Requirements",
    "## Feature Summary",
    "## Functional Requirements",
    "## Non-Functional Requirements",
    "## Constraints",
    "## Assumptions",
    "## Open Questions",
  ],
  architecture: [
    "# Architecture",
    "## Overview",
    "## Components",
    "## Data Flow",
    "## Key Design Decisions",
    "## Failure Handling",
    "## Observability",
    "## Risks and Trade-offs",
  ],
};

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateOutput(stepId: string, output: string): ValidationResult {
  if (stepId in requiredHeadingsByStep) {
    const required = requiredHeadingsByStep[stepId];
    const missing = required.filter((heading) => !output.includes(heading));

    if (missing.length > 0) {
      return {
        valid: false,
        error: `Missing required headings for ${stepId}: ${missing.join(", ")}`,
      };
    }

    return { valid: true };
  }

  if (stepId === "jira-task") {
    const hasPreferredHeading = output.includes("# Tasks");
    const hasLegacyHeading = output.includes("# Jira Tasks");
    if (!hasPreferredHeading && !hasLegacyHeading) {
      return { valid: false, error: "Missing required heading # Tasks" };
    }

    if (!/##\s+TASK-\d+:/.test(output)) {
      return { valid: false, error: "Missing required TASK headings matching ## TASK-<number>:" };
    }

    return { valid: true };
  }

  if (stepId === "task-prompt") {
    if (!output.includes("# Task Prompts")) {
      return { valid: false, error: "Missing required heading # Task Prompts" };
    }

    if (!/##\s+TASK-\d+/.test(output)) {
      return { valid: false, error: "Missing required TASK headings matching ## TASK-<number>" };
    }

    return { valid: true };
  }

  return {
    valid: false,
    error: `Unknown step '${stepId}' for output validation.`,
  };
}

export async function handleValidationFailure(
  stepId: string,
  output: string,
  versionDir: string,
  errorMessage: string,
): Promise<string> {
  const artifact = artifactFileName(stepId);
  const invalidPath = path.join(versionDir, artifact.replace(/\.md$/i, ".invalid.md"));

  await writeFile(invalidPath, output, "utf8");

  const message = `Validation failed for ${artifact}: ${errorMessage}`;
  console.error(message);
  logger.info(message);

  return invalidPath;
}
