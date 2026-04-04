export interface StepDefinition {
  id: string;
  prompt: string;
  input?: string[];
  output: string;
}

export interface WorkflowDefinition {
  id: string;
  description?: string;
  steps: StepDefinition[];
}
