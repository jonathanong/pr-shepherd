import { classifyChecks } from "../checks/classify.mts";
import type { CheckRun, PollSummaryChecks } from "../types.mts";
import { parseCreatedAt } from "./batch-parser-helpers.mts";
import type { RawCheckRollup, RawSummaryPr } from "./poll-summary-raw.mts";

export function summarizePollSummaryChecks(raw: RawSummaryPr): PollSummaryChecks {
  const rollups = summaryRollups(raw);
  const counts: Record<string, number> = {};
  for (const check of classifiedSummaryChecks(raw)) {
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
  return summary;
}

/** Names of failing checks in the loaded summary rollup. */
export function failingSummaryCheckNames(raw: RawSummaryPr): string[] {
  return classifiedSummaryChecks(raw)
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

function classifiedSummaryChecks(raw: RawSummaryPr) {
  // A successful check on the queue commit cannot cover a PR-head cancellation, or vice versa.
  return summaryRollups(raw).flatMap(({ rollup, scope }) =>
    classifyChecks(
      checkRuns(rollup, scope),
      scope === "merge_group" ? { additionalRelevantEvents: ["merge_group"] } : {},
    ),
  );
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
