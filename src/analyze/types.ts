export interface AnalyzeTaskReference {
  taskId: string;
  title: string;
}

export interface AnalyzeModifiedTask extends AnalyzeTaskReference {
  change: string;
  recommendedJiraUpdate: string;
}

export interface AnalyzeRemovedTask extends AnalyzeTaskReference {
  reason: string;
}

export interface AnalyzeNewTask extends AnalyzeTaskReference {
  reason: string;
  suggestedDescription: string;
}

export interface TaskImpact {
  unchanged: AnalyzeTaskReference[];
  modified: AnalyzeModifiedTask[];
  removed: AnalyzeRemovedTask[];
  new: AnalyzeNewTask[];
}

// Backward-compatible alias that matches the current spec JSON key naming.
export type JiraTaskImpact = TaskImpact;

export interface TaskPromptImpact {
  changed: boolean;
  summary: string;
}

export interface AnalyzeChangeModel {
  project: string;
  feature: string;
  fromVersion: string;
  toVersion: string;
  summary: string;
  requirementsChanges: string[];
  architectureChanges: string[];
  jiraTaskImpact: JiraTaskImpact;
  taskPromptImpact: TaskPromptImpact;
  recommendedJiraActions: string[];
}

// Internal neutral model to reduce tool-specific coupling in implementation code.
export interface AnalyzeChangeInternalModel {
  project: string;
  feature: string;
  fromVersion: string;
  toVersion: string;
  summary: string;
  requirementsChanges: string[];
  architectureChanges: string[];
  taskImpact: TaskImpact;
  taskPromptImpact: TaskPromptImpact;
  recommendedTaskActions: string[];
}

export interface LoadedVersionArtifacts {
  requirements: { from: string; to: string };
  architecture: { from: string; to: string };
  jiraTask: { from: string; to: string };
  taskPrompt: { from: string; to: string };
}

export interface ClassifyChangesInput {
  project: string;
  feature: string;
  fromVersion: string;
  toVersion: string;
  artifacts: LoadedVersionArtifacts;
}