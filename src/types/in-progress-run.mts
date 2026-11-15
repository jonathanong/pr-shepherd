/** One in-progress Actions run on the head, as `triage.inProgressRuns[]` reports it. */
export interface InProgressRun {
  runId: string;
  workflowName: string;
  /** Raw check status of the run: `WAITING` when any of its checks waits, else the first check's. */
  status: string;
  /**
   * The workflow's top-level `concurrency.cancel-in-progress`, raw: `cancel-in-progress=true`,
   * `cancel-in-progress=${{ ... }}`, `cancel-in-progress=unset`, `none`, or `unreadable (<why>)`.
   */
  concurrency: string;
  /** Failed sibling checks of the same run. Present only with `running`. */
  failed?: string[];
  /** Still-running sibling checks of the same run. Present only with `failed`. */
  running?: string[];
  /** The `checks.never-cancel` pattern that protects this run. */
  neverCancel?: string;
  /** `gh run cancel` for this run. Present only when Shepherd recommends cancelling it. */
  cancelCommand?: string;
}
