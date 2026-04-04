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

export interface JiraTaskImpact {
  unchanged: AnalyzeTaskReference[];
  modified: AnalyzeModifiedTask[];
  removed: AnalyzeRemovedTask[];
  new: AnalyzeNewTask[];
}

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