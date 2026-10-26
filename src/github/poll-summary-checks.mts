import { classifyChecks } from "../checks/classify.mts";
import { mergeStartupFailureChecks } from "../checks/startup-failures.mts";
import { startupFailureChecksFromSuites } from "./batch-parse-suites.mts";
import type { CheckRun, PollSummaryChecks } from "../types.mts";
import { parseCreatedAt } from "./batch-parser-helpers.mts";
import type { RawCheckRollup, RawSummaryPr } from "./poll-summary-raw.mts";

export function summarizePollSummaryChecks(
  raw: RawSummaryPr,
  requiredContexts?: readonly string[],
): PollSummaryChecks {
  const rollups = summaryRollups(raw);
  const counts: Record<string, number> = {};
  for (const check of classifiedSummaryChecks(raw, requiredContexts)) {
    const key = {
      passed: "passing",
      failing: "failing",
      in_progress: "inProgress",
      skipped: "skipped",
      filtered: "filtered",
      ignored: "ignored",
      superseded: "superseded",
    }[check.category];
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const summary = counts as PollSummaryChecks;
  if (rollups.some(({ rollup }) => rollup.contexts.pageInfo.hasPreviousPage)) {
    summary.incomplete = true;
  }
  // The first 50 check suites are all the summary reads. The one-PR check lists the
  // remaining workflow runs for startup failures; here an unread suite stays unverified.
  if (raw.commits.nodes[0]?.commit.checkSuites?.pageInfo?.hasNextPage === true) {
    summary.incomplete = true;
  }
  return summary;
}

/** Names of failing checks in the loaded summary rollup. */
export function failingSummaryCheckNames(
  raw: RawSummaryPr,
  requiredContexts?: readonly string[],
): string[] {
  return classifiedSummaryChecks(raw, requiredContexts)
    .filter((check) => check.category === "failing")
    .map((check) => check.name);
}

function summaryRollups(raw: RawSummaryPr) {
  return [
    { rollup: raw.commits.nodes[0]?.commit.statusCheckRollup, scope: undefined },
    {
      rollup: raw.mergeQueueEntry?.headCommit?.statusCheckRollup,
      scope: "merge_group" as const,
    },
  ].flatMap(({ rollup, scope }) => (rollup ? [{ rollup, scope }] : []));
}

export function classifiedSummaryChecks(raw: RawSummaryPr, requiredContexts?: readonly string[]) {
  // A successful check on the queue commit cannot cover a PR-head cancellation, or vice versa.
  const groups = summaryRollups(raw).map(({ rollup, scope }) => ({
    runs: checkRuns(rollup, scope),
    scope,
  }));
  if (!groups.some(({ scope }) => scope === undefined))
    groups.unshift({ runs: [], scope: undefined });
  return groups.flatMap(({ runs, scope }) =>
    classifyChecks(scope ? runs : withStartupFailures(raw, runs), {
      ...(scope === "merge_group" && { additionalRelevantEvents: ["merge_group"] }),
      ...(requiredContexts && { requiredContexts }),
    }),
  );
}

/** A workflow run that never started has no check run; the one-PR check synthesizes it as failing. */
function withStartupFailures(raw: RawSummaryPr, runs: CheckRun[]) {
  const suites = raw.commits.nodes[0]?.commit.checkSuites;
  return mergeStartupFailureChecks(runs, startupFailureChecksFromSuites(suites));
}

function checkRuns(rollup: RawCheckRollup, scope: CheckRun["scope"]): CheckRun[] {
  return rollup.contexts.nodes.map((context): CheckRun => {
    if (context.__typename === "StatusContext") {
      return {
        name: context.context,
        status:
          context.state === "PENDING" || context.state === "EXPECTED" ? "IN_PROGRESS" : "COMPLETED",
        conclusion:
          context.state === "SUCCESS"
            ? "SUCCESS"
            : context.state === "FAILURE" || context.state === "ERROR"
              ? "FAILURE"
              : null,
        source: "status_context",
        detailsUrl: "",
        event: null,
        runId: null,
        ...(scope && { scope }),
      };
    }
    const run = context.checkSuite?.workflowRun;
    return {
      id: context.id,
      name: context.name,
      status: context.status as CheckRun["status"],
      conclusion: context.conclusion as CheckRun["conclusion"],
      source: "check_run",
      detailsUrl: context.detailsUrl ?? "",
      event: run?.event ?? null,
      runId: run?.databaseId != null ? String(run.databaseId) : null,
      ...(run?.workflow?.name && { workflowName: run.workflow.name }),
      ...(run?.workflow?.databaseId != null && {
        workflowId: String(run.workflow.databaseId),
      }),
      ...(context.startedAt && { startedAtUnix: parseCreatedAt(context.startedAt) }),
      ...(context.completedAt && { completedAtUnix: parseCreatedAt(context.completedAt) }),
      ...(scope && { scope }),
    };
  });
}
