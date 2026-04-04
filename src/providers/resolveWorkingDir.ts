import path from "node:path";
import type { ConfigContext } from "../config/types";

export function resolveWorkingDir(context: ConfigContext, cwd: string = process.cwd()): string {
  if (context.projectConfig?.repoPath) {
    return path.resolve(context.rootDir, context.projectConfig.repoPath);
  }

  return cwd;
}
