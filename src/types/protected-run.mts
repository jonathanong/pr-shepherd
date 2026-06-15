export interface ProtectedRun {
  runId: string;
  matchedPattern: string;
  checkNames: string[];
  workflowName?: string;
}
