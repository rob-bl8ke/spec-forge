export function stepIdToVariable(stepId: string): string {
  return stepId.replace(/-/g, "_");
}
