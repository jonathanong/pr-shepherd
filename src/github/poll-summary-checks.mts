import { classifyChecks } from "../checks/classify.mts";
import type { CheckRun, PollSummaryChecks } from "../types.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

export function summarizePollSummaryChecks(raw: RawSummaryPr): PollSummaryChecks {
  const rollups = [
    raw.commits.nodes[0]?.commit.statusCheckRollup,
    raw.mergeQueueEntry?.headCommit?.statusCheckRollup,
  ].filter((rollup) => rollup !== null && rollup !== undefined);
  const checks = rollups.flatMap((rollup, rollupIndex) =>
    rollup.contexts.nodes.map((context): CheckRun => {
      if (context.__typename === "StatusContext") {
        return {
          name: context.context,
          status:
            context.state === "PENDING" || context.state === "EXPECTED"
              ? "IN_PROGRESS"
              : "COMPLETED",
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
          ...(rollupIndex === 1 && { scope: "merge_group" as const }),
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
        ...(rollupIndex === 1 && { scope: "merge_group" as const }),
      };
    }),
  );
  const counts: Record<string, number> = {};
  for (const check of classifyChecks(checks, { additionalRelevantEvents: ["merge_group"] })) {
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
  if (rollups.some((rollup) => rollup.contexts.pageInfo.hasPreviousPage)) {
    summary.incomplete = true;
  }
  return summary;
}
