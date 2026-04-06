import { Command } from "commander";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCommandContext } from "../config/context";
import { discoverSyncTargets } from "../sync/discoverSyncTargets";
import { printSyncPreview } from "../sync/printSyncPreview";
import { printDiffForTarget } from "../sync/generateDiff";
import { confirmSync } from "../sync/confirmSync";
import { applySyncChanges } from "../sync/applySyncChanges";

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .argument("<project-name>", "Project name")
    .description("Sync configured assets into a repository")
    .action(async () => {
      const context = getCommandContext();

      if (!context.resolvedProject) {
        throw new Error("sync requires a project configuration. Use: spec-forge sync <project-name>");
      }

      const project = context.resolvedProject;
      const assets = project.assets ?? {};
      const targetDir = project.sync?.targetDir ?? ".github/spec-forge";
      const targets = project.sync?.targets;
      const repoPath = path.resolve(context.rootDir, project.repoPath);
      const syncedAt = new Date().toISOString();

      const syncTargets = await discoverSyncTargets({
        rootDir: context.rootDir,
        repoPath,
        targetDir,
        targets,
        assets,
      });

      const preview = printSyncPreview(syncTargets);

      for (const target of syncTargets) {
        if (target.status !== "UPDATE") {
          continue;
        }

        let currentTarget = "";
        try {
          currentTarget = await readFile(target.targetPath, "utf8");
        } catch {
          // UPDATE should exist, but if it does not we safely continue with empty baseline.
        }

        printDiffForTarget(target.targetPath, currentTarget, target.sourceContent);
      }

      const confirmation = await confirmSync({
        hasPendingChanges: preview.requiresConfirmation,
      });

      if (!confirmation.confirmed) {
        return;
      }

      const result = await applySyncChanges({
        rootDir: context.rootDir,
        projectName: project.name,
        syncedAt,
        targets: syncTargets,
      });

      console.log(
        `Sync complete: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged, ${result.failed} failed`,
      );
    });
}
