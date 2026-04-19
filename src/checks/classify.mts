/**
 * Classifies check runs into shepherd categories and filters out irrelevant ones.
 *
 * Rules:
 *   1. Skip checks whose workflow event is NOT `pull_request` or `pull_request_target`.
 *      Push-triggered, merge-queue, schedule, and workflow-dispatch runs are irrelevant
 *      to PR readiness.
 *   2. Drop checks with `conclusion == SKIPPED` or `conclusion == NEUTRAL` from the
 *      pass/fail tally. Report them as "skipped" for transparency but don't block on them.
 */

import type { CheckRun, ClassifiedCheck } from "../types.mts";
import { loadConfig } from "../config/load.mts";

const RELEVANT_EVENTS = new Set(loadConfig().checks.ciTriggerEvents);

/**
 * Classify a list of raw check runs into shepherd categories.
 *
 * @param checks Raw check runs from the batch query.
 * @returns Classified checks. "filtered" items were excluded from the tally.
 */
export function classifyChecks(checks: CheckRun[]): ClassifiedCheck[] {
  return checks.map((c) => classify(c));
}

function classify(check: CheckRun): ClassifiedCheck {
  // Filter: runs from non-PR events don't count toward PR readiness.
  if (check.event !== null && !RELEVANT_EVENTS.has(check.event)) {
    return { ...check, category: "filtered" };
  }

  const { status, conclusion } = check;

  // Not yet finished.
  if (status !== "COMPLETED") {
    return { ...check, category: "in_progress" };
  }

  // Skipped / neutral — report but don't block.
  if (conclusion === "SKIPPED" || conclusion === "NEUTRAL") {
    return { ...check, category: "skipped" };
  }

  // Success.
  if (conclusion === "SUCCESS") {
    return { ...check, category: "passed" };
  }

  // Everything else (FAILURE, TIMED_OUT, CANCELLED, ACTION_REQUIRED, STARTUP_FAILURE, STALE).
  return { ...check, category: "failing" };
}

// ---------------------------------------------------------------------------
// Aggregate verdict helpers
// ---------------------------------------------------------------------------

export interface CiVerdict {
  /** True when all relevant (non-filtered, non-skipped) checks passed. */
  allPassed: boolean;
  /** True when at least one check is still running/queued. */
  anyInProgress: boolean;
  /** True when at least one check failed. */
  anyFailing: boolean;
  /** Names of checks that were filtered out (triggered by non-PR events). */
  filteredNames: string[];
}

/** Compute a high-level CI verdict from a list of classified checks. */
export function getCiVerdict(classified: ClassifiedCheck[]): CiVerdict {
  const relevant = classified.filter((c) => c.category !== "filtered" && c.category !== "skipped");
  const anyInProgress = relevant.some((c) => c.category === "in_progress");
  const anyFailing = relevant.some((c) => c.category === "failing");
  // When there are no relevant checks (e.g. docs-only PR where all checks are filtered/skipped),
  // treat as allPassed rather than blocking — there's nothing to fail.
  const allPassed = !anyInProgress && !anyFailing;
  const filteredNames = classified.filter((c) => c.category === "filtered").map((c) => c.name);

  return { allPassed, anyInProgress, anyFailing, filteredNames };
}
