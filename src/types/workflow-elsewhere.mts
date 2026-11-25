/** One inline annotation on a failed job in another run of the same workflow. */
export interface ElsewhereAnnotation {
  path: string;
  line: number | null;
  message: string;
}

/** One failed or timed-out job in another run of the same workflow. */
export interface ElsewhereFailedJob {
  name: string;
  conclusion: string;
  /** True when this job's exact name matches the failing merge-group check's name. */
  sameJob?: true;
  annotations: ElsewhereAnnotation[];
  /** Count of additional annotations beyond the shown cap; omitted when zero or unknown. */
  moreAnnotations?: number;
}

/** Bounded-read scope for `Same workflow elsewhere` so callers see exactly what was inspected. */
export interface ElsewhereScope {
  workflowName?: string;
  workflowPath?: string;
  /** ISO 8601 UTC start of the comparison window. */
  since: string;
  defaultBranch: {
    branch: string;
    /** Default-branch commits read (GraphQL transport). */
    commitsRead?: number;
    /** Default-branch workflow runs read (REST transport). */
    runsRead?: number;
    matched: number;
    shown: number;
  };
  mergeQueue: {
    runsRead: number;
    matched: number;
    shown: number;
  };
}

/** One completed run of the same workflow on the default branch or another merge-queue entry. */
export interface ElsewhereRun {
  source: "default-branch" | "merge-queue";
  /** Default branch name (e.g. `"main"`), set when `source === "default-branch"`. */
  branch?: string;
  /** Other PR number parsed from `gh-readonly-queue/<base>/pr-<N>-<sha>`, when known. */
  pr?: number;
  /** 7-character head commit SHA. */
  headSha: string;
  runId: string;
  conclusion: string;
  completedAt: string;
  failedJobs: ElsewhereFailedJob[];
}
