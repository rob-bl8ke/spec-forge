import type {
  AnalyzeChangeModel,
  AnalyzeNewTask,
  AnalyzeRemovedTask,
  AnalyzeTaskReference,
  ClassifyChangesInput,
  JiraTaskImpact,
} from "./types";

interface ParsedTask {
  taskId: string;
  title: string;
  content: string;
}

function normalizeLine(line: string): string {
  return line.trim();
}

function splitNormalizedLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0);
}

function summarizeContentChanges(label: string, fromContent: string, toContent: string): string[] {
  if (fromContent.trim() === toContent.trim()) {
    return [`No ${label} changes detected.`];
  }

  const fromLines = splitNormalizedLines(fromContent);
  const toLines = splitNormalizedLines(toContent);

  const fromSet = new Set(fromLines);
  const toSet = new Set(toLines);

  const added = toLines.filter((line) => !fromSet.has(line));
  const removed = fromLines.filter((line) => !toSet.has(line));

  const summaries: string[] = [];

  if (added.length > 0) {
    summaries.push(`Added ${added.length} ${label} line(s).`);
    for (const line of added.slice(0, 3)) {
      summaries.push(`Added: ${line}`);
    }
  }

  if (removed.length > 0) {
    summaries.push(`Removed ${removed.length} ${label} line(s).`);
    for (const line of removed.slice(0, 3)) {
      summaries.push(`Removed: ${line}`);
    }
  }

  if (summaries.length === 0) {
    summaries.push(`${label[0].toUpperCase()}${label.slice(1)} changed with line-level updates.`);
  }

  return summaries;
}

function parseTaskSections(content: string): Map<string, ParsedTask> {
  const headingPattern = /^##\s+(TASK-\d+):\s*(.+)$/gm;
  const matches: Array<{ taskId: string; title: string; start: number; end: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = headingPattern.exec(content)) !== null) {
    matches.push({
      taskId: match[1],
      title: match[2].trim(),
      start: match.index,
      end: headingPattern.lastIndex,
    });
  }

  const tasks = new Map<string, ParsedTask>();
  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    const bodyStart = current.end;
    const bodyEnd = next ? next.start : content.length;
    const body = content.slice(bodyStart, bodyEnd).trim();
    const normalized = `## ${current.taskId}: ${current.title}\n${body}`.trim();

    tasks.set(current.taskId, {
      taskId: current.taskId,
      title: current.title,
      content: normalized,
    });
  }

  return tasks;
}

function taskSort(a: AnalyzeTaskReference, b: AnalyzeTaskReference): number {
  const aNum = Number.parseInt(a.taskId.replace("TASK-", ""), 10);
  const bNum = Number.parseInt(b.taskId.replace("TASK-", ""), 10);
  return aNum - bNum;
}

function classifyJiraTaskImpact(fromContent: string, toContent: string): JiraTaskImpact {
  const fromTasks = parseTaskSections(fromContent);
  const toTasks = parseTaskSections(toContent);

  const unchanged: AnalyzeTaskReference[] = [];
  const modified: Array<AnalyzeTaskReference & { change: string; recommendedJiraUpdate: string }> = [];
  const removed: AnalyzeRemovedTask[] = [];
  const created: AnalyzeNewTask[] = [];

  for (const [taskId, fromTask] of fromTasks) {
    const toTask = toTasks.get(taskId);
    if (!toTask) {
      removed.push({
        taskId,
        title: fromTask.title,
        reason: `Task ${taskId} exists in from-version but is not present in to-version.`,
      });
      continue;
    }

    if (fromTask.content === toTask.content) {
      unchanged.push({ taskId, title: toTask.title });
      continue;
    }

    modified.push({
      taskId,
      title: toTask.title,
      change: `Task ${taskId} content changed between versions.`,
      recommendedJiraUpdate: `Review and update task ticket for ${taskId} to reflect revised scope.`,
    });
  }

  for (const [taskId, toTask] of toTasks) {
    if (fromTasks.has(taskId)) {
      continue;
    }

    created.push({
      taskId,
      title: toTask.title,
      reason: `Task ${taskId} is new in to-version and did not exist in from-version.`,
      suggestedDescription: `Create Jira ticket ${taskId}: ${toTask.title}`,
    });
  }

  unchanged.sort(taskSort);
  modified.sort(taskSort);
  removed.sort(taskSort);
  created.sort(taskSort);

  return {
    unchanged,
    modified,
    removed,
    new: created,
  };
}

function summarizeTaskPromptImpact(fromContent: string, toContent: string): { changed: boolean; summary: string } {
  const changed = fromContent.trim() !== toContent.trim();
  return {
    changed,
    summary: changed
      ? "task-prompt.md changed between versions."
      : "task-prompt.md is unchanged between versions.",
  };
}

function summarizeOverall(model: Pick<AnalyzeChangeModel, "requirementsChanges" | "architectureChanges" | "jiraTaskImpact" | "taskPromptImpact">): string {
  const modifiedCount = model.jiraTaskImpact.modified.length;
  const removedCount = model.jiraTaskImpact.removed.length;
  const newCount = model.jiraTaskImpact.new.length;
  const unchangedCount = model.jiraTaskImpact.unchanged.length;

  return [
    `Requirements entries: ${model.requirementsChanges.length}`,
    `Architecture entries: ${model.architectureChanges.length}`,
    `Tasks unchanged: ${unchangedCount}, modified: ${modifiedCount}, removed: ${removedCount}, new: ${newCount}`,
    `Task prompt changed: ${model.taskPromptImpact.changed ? "yes" : "no"}`,
  ].join(" | ");
}

export function classifyChanges(input: ClassifyChangesInput): AnalyzeChangeModel {
  const requirementsChanges = summarizeContentChanges(
    "requirements",
    input.artifacts.requirements.from,
    input.artifacts.requirements.to,
  );
  const architectureChanges = summarizeContentChanges(
    "architecture",
    input.artifacts.architecture.from,
    input.artifacts.architecture.to,
  );
  const jiraTaskImpact = classifyJiraTaskImpact(
    input.artifacts.jiraTask.from,
    input.artifacts.jiraTask.to,
  );
  const taskPromptImpact = summarizeTaskPromptImpact(
    input.artifacts.taskPrompt.from,
    input.artifacts.taskPrompt.to,
  );

  const recommendedJiraActions: string[] = [];
  if (jiraTaskImpact.new.length > 0) {
    recommendedJiraActions.push("Create task tickets for all tasks in jiraTaskImpact.new.");
  }
  if (jiraTaskImpact.modified.length > 0) {
    recommendedJiraActions.push("Update existing task tickets for all tasks in jiraTaskImpact.modified.");
  }
  if (jiraTaskImpact.removed.length > 0) {
    recommendedJiraActions.push("Close or de-scope task tickets for all tasks in jiraTaskImpact.removed.");
  }
  if (recommendedJiraActions.length === 0) {
    recommendedJiraActions.push("No task ticket updates required.");
  }

  const model: AnalyzeChangeModel = {
    project: input.project,
    feature: input.feature,
    fromVersion: input.fromVersion,
    toVersion: input.toVersion,
    summary: "",
    requirementsChanges,
    architectureChanges,
    jiraTaskImpact,
    taskPromptImpact,
    recommendedJiraActions,
  };

  model.summary = summarizeOverall(model);
  return model;
}