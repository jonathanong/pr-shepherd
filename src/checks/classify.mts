/**
 * Classifies check runs into shepherd categories and filters out irrelevant ones.
 *
 * Rules:
 *   1. Skip checks whose workflow event is NOT `pull_request` or `pull_request_target`.
 *      Push-triggered, merge-queue, schedule, and workflow-dispatch runs are irrelevant
 *      to PR readiness.
 *   2. Drop checks with `conclusion == SKIPPED` or `conclusion == NEUTRAL` from the
 *      pass/fail tally. Report them as "skipped" for transparency but don't block on them.
 *   3. Reclassify `CANCELLED` checks as "superseded" (non-blocking) when a newer run of
 *      the same workflow exists on the same commit — this is GitHub's concurrency-group
 *      eviction behavior, not a real failure. GitHub branch protection itself resolves
 *      required status checks by latest-run-per-name and merges past these; mirroring
 *      that here keeps shepherd's verdict aligned with what GitHub will actually allow.
 */

import type { CheckRun, ClassifiedCheck } from "../types.mts";
import { loadConfig } from "../config/load.mts";
import { buildSupersededIndices } from "./superseded.mts";
import picomatch from "picomatch";

/**
 * Classify a list of raw check runs into shepherd categories.
 *
 * @param checks Raw check runs from the batch query.
 * @returns Classified checks. "filtered" items were excluded from the tally.
 */
export function classifyChecks(checks: CheckRun[]): ClassifiedCheck[] {
  const config = loadConfig();
  const relevantEvents = new Set(config.checks.ciTriggerEvents);
  const isIgnored = buildMatcher(config.ignoreChecks ?? []);
  const isProtected = buildMatcher(config.actions.neverCancelRuns ?? []);
  const protectedRunIds = buildProtectedRunIds(checks, isProtected);
  const supersededIndices = buildSupersededIndices(checks);
  return checks.map((c, index) => {
    if (isIgnored(c.name) && !isProtectedCheck(c, protectedRunIds)) {
      return { ...c, category: "ignored" as const };
    }
    const classified = classify(c, relevantEvents);
    // Only ever override a "failing" verdict (i.e. conclusion === CANCELLED, guaranteed by
    // buildSupersededIndices below) — never touch filtered/skipped/passed classifications.
    if (classified.category === "failing" && supersededIndices.has(index)) {
      return { ...classified, category: "superseded" as const };
    }
    return classified;
  });
}

function buildMatcher(patterns: string[]): (name: string) => boolean {
  if (patterns.length === 0) return () => false;
  return picomatch(patterns, { nocase: true });
}

function buildProtectedRunIds(
  checks: CheckRun[],
  isProtected: (name: string) => boolean,
): Set<string> {
  const protectedRunIds = new Set<string>();
  for (const check of checks) {
    if (check.runId == null) continue;
    if (protectedRunIds.has(check.runId) || checkMatchesProtection(check, isProtected)) {
      protectedRunIds.add(check.runId);
    }
  }
  return protectedRunIds;
}

function isProtectedCheck(check: CheckRun, protectedRunIds: Set<string>): boolean {
  return check.runId != null && protectedRunIds.has(check.runId);
}

function checkMatchesProtection(check: CheckRun, isProtected: (name: string) => boolean): boolean {
  return [check.workflowName, check.name]
    .filter((name): name is string => typeof name === "string" && name.trim() !== "")
    .some((name) => isProtected(name));
}

function classify(check: CheckRun, relevantEvents: Set<string>): ClassifiedCheck {
  // Filter: runs from non-PR events don't count toward PR readiness.
  // event === null means a commit StatusContext — these are always relevant regardless of ciTriggerEvents.
  if (check.event !== null && !relevantEvents.has(check.event)) {
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
  /** True when all relevant (non-filtered, non-skipped, non-ignored) checks passed. */
  allPassed: boolean;
  /** True when at least one relevant (non-filtered, non-skipped, non-ignored) check exists. */
  hasChecks: boolean;
  /** True when at least one check is still running/queued. */
  anyInProgress: boolean;
  /** True when at least one check failed. */
  anyFailing: boolean;
  /** Names of checks that were filtered out (triggered by non-PR events). */
  filteredNames: string[];
  /** Names of checks suppressed by the user's ignoreChecks config. */
  ignoredNames: string[];
  /** Names of CANCELLED checks superseded by a newer run of the same workflow (concurrency-group eviction). */
  supersededNames: string[];
}

/** Compute a high-level CI verdict from a list of classified checks. */
export function getCiVerdict(classified: ClassifiedCheck[]): CiVerdict {
  const relevant = classified.filter(
    (c) =>
      c.category !== "filtered" &&
      c.category !== "skipped" &&
      c.category !== "ignored" &&
      c.category !== "superseded",
  );
  const anyInProgress = relevant.some((c) => c.category === "in_progress");
  const anyFailing = relevant.some((c) => c.category === "failing");
  // When there are no relevant checks (e.g. docs-only PR where all checks are filtered/skipped),
  // treat as allPassed rather than blocking — there's nothing to fail.
  const allPassed = !anyInProgress && !anyFailing;
  const hasChecks = relevant.length > 0;
  const filteredNames = classified.filter((c) => c.category === "filtered").map((c) => c.name);
  const ignoredNames = Array.from(
    new Set(classified.filter((c) => c.category === "ignored").map((c) => c.name)),
  );
  const supersededNames = Array.from(
    new Set(classified.filter((c) => c.category === "superseded").map((c) => c.name)),
  );

  return {
    allPassed,
    hasChecks,
    anyInProgress,
    anyFailing,
    filteredNames,
    ignoredNames,
    supersededNames,
  };
}
