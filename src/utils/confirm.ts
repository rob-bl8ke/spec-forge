import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export interface ConfirmService {
  showUnifiedDiff(currentPath: string, newPath: string, currentContent: string, newContent: string): Promise<void>;
  confirmYesNo(prompt: string): Promise<boolean>;
}

export function createUnifiedDiff(currentPath: string, newPath: string, currentContent: string, newContent: string): string {
  const oldLines = currentContent.split(/\r?\n/);
  const newLines = newContent.split(/\r?\n/);
  const max = Math.max(oldLines.length, newLines.length);

  const body: string[] = [];
  for (let i = 0; i < max; i += 1) {
    const oldLine = oldLines[i];
    const nextLine = newLines[i];

    if (oldLine === nextLine) {
      if (oldLine !== undefined) {
        body.push(` ${oldLine}`);
      }
      continue;
    }

    if (oldLine !== undefined) {
      body.push(`-${oldLine}`);
    }

    if (nextLine !== undefined) {
      body.push(`+${nextLine}`);
    }
  }

  return [`--- ${currentPath}`, `+++ ${newPath}`, ...body].join("\n");
}

class ConsoleConfirmService implements ConfirmService {
  async showUnifiedDiff(currentPath: string, newPath: string, currentContent: string, newContent: string): Promise<void> {
    const diff = createUnifiedDiff(currentPath, newPath, currentContent, newContent);
    console.log(diff);
  }

  async confirmYesNo(prompt: string): Promise<boolean> {
    const readline = createInterface({ input, output });
    try {
      while (true) {
        const answer = (await readline.question(`${prompt} `)).trim().toLowerCase();
        if (answer === "y") {
          return true;
        }
        if (answer === "n") {
          return false;
        }
      }
    } finally {
      readline.close();
    }
  }
}

export const confirmService: ConfirmService = new ConsoleConfirmService();
