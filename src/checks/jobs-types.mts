export interface ActionsJob {
  id?: number;
  name: string;
  workflow_name?: string;
  conclusion: string | null;
  run_attempt?: number;
  steps?: Array<{ name: string; number: number; conclusion: string | null }>;
}

/** Name of the first step with a non-success, non-skipped, non-neutral conclusion. */
export function pickFailedStep(job: ActionsJob): string | undefined {
  return job.steps?.find(
    (s) =>
      s.conclusion !== null &&
      s.conclusion !== "success" &&
      s.conclusion !== "skipped" &&
      s.conclusion !== "neutral",
  )?.name;
}
