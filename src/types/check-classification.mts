// Check-run classification types, split out of github.mts to stay under the file-length cap.

import type { CheckAnnotation } from "./check-annotations.mts";
import type { CheckRun } from "./github.mts";

type CheckCategory =
  | "passed"
  | "failing"
  | "in_progress"
  | "skipped"
  | "filtered"
  | "ignored"
  | "superseded";

export interface ClassifiedCheck extends CheckRun {
  category: CheckCategory;
  /** Inline annotations attached to this check run, surfaced once per PR. */
  annotations?: CheckAnnotation[];
}

/** Another failed job in the same workflow run that is not its own failing check entry. */
export interface RelatedFailedJob {
  name: string;
  /** Uppercased job conclusion (e.g. `FAILURE`, `TIMED_OUT`). */
  conclusion: string;
  failedStep?: string;
  logExcerpt?: string;
}

export interface TriagedCheck extends ClassifiedCheck {
  /** Workflow display name (e.g. `"CI"`). Populated when available from the jobs API; may be `undefined` on fetch failure or when no matching job is found. */
  workflowName?: string;
  /** Name of the matched job (e.g. `"tests (ubuntu)"`). Distinct from the check name for matrix builds. */
  jobName?: string;
  /** Name of the first failed step in the matched job (e.g. `"Run tests"`). */
  failedStep?: string;
  /** Bounded raw excerpt from the matched failed job log, when GitHub exposes one. */
  logExcerpt?: string;
  /** Sibling failed jobs from the same run, with log tails (reported once per run). */
  relatedJobs?: RelatedFailedJob[];
}
