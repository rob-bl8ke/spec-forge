import { Command } from "commander";
import { getCommandContext } from "../config/context";
import { loadVersionArtifacts } from "../analyze/loadVersionArtifacts";
import { classifyChanges } from "../analyze/classifyChanges";
import { generateMarkdownReport } from "../analyze/generateMarkdownReport";
import { generateJsonReport } from "../analyze/generateJsonReport";
import type { LoadedVersionArtifacts } from "../analyze/types";

function transformLoadResultToArtifacts(
  result: Awaited<ReturnType<typeof loadVersionArtifacts>>,
): LoadedVersionArtifacts {
  let requirements: { from: string; to: string } | undefined;
  let architecture: { from: string; to: string } | undefined;
  let jiraTask: { from: string; to: string } | undefined;
  let taskPrompt: { from: string; to: string } | undefined;

  for (const pair of result.pairs) {
    // Map file names to artifact keys
    switch (pair.fileName) {
      case "requirements.md":
        requirements = { from: pair.fromContent, to: pair.toContent };
        break;
      case "architecture.md":
        architecture = { from: pair.fromContent, to: pair.toContent };
        break;
      case "jira-task.md":
        jiraTask = { from: pair.fromContent, to: pair.toContent };
        break;
      case "task-prompt.md":
        taskPrompt = { from: pair.fromContent, to: pair.toContent };
        break;
      default:
        throw new Error(`Unknown artifact file: ${pair.fileName}`);
    }
  }

  if (!requirements || !architecture || !jiraTask || !taskPrompt) {
    throw new Error("Missing required artifact");
  }

  return {
    requirements,
    architecture,
    jiraTask,
    taskPrompt,
  };
}

export function registerAnalyzeChangeCommand(program: Command): void {
  program
    .command("analyze-change")
    .argument("<project>", "Project name")
    .argument("<feature>", "Feature name")
    .argument("<from-version>", "Source version")
    .argument("<to-version>", "Target version")
    .description("Analyze impact between two workflow output versions")
    .action(async (project: string, feature: string, fromVersion: string, toVersion: string) => {
      const context = getCommandContext();

      // Load version artifacts
      const loadResult = await loadVersionArtifacts({
        rootDir: context.rootDir,
        project,
        feature,
        fromVersion,
        toVersion,
      });

      const artifacts = transformLoadResultToArtifacts(loadResult);

      // Classify changes
      const changeModel = classifyChanges({
        project,
        feature,
        fromVersion,
        toVersion,
        artifacts,
      });

      // Generate markdown report
      await generateMarkdownReport({
        rootDir: context.rootDir,
        model: changeModel,
      });

      // Generate JSON report
      await generateJsonReport({
        rootDir: context.rootDir,
        model: changeModel,
      });
    });
}
