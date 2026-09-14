import { classifyChecks } from "../checks/classify.mts";
import type { CheckRun, PollSummaryChecks } from "../types.mts";
import { extractCheckRunSummary, mapStatusContextState } from "./batch-parser-helpers.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

export function summarizePollSummaryChecks(raw: RawSummaryPr): PollSummaryChecks {
  const rollups = [
    raw.commits.nodes[0]?.commit.statusCheckRollup,
    raw.mergeQueueEntry?.headCommit?.statusCheckRollup,
  ].filter((rollup) => rollup !== null && rollup !== undefined);
  const checks = rollups.flatMap((rollup, rollupIndex) =>
    rollup.contexts.nodes.map((context): CheckRun => {
      if (context.__typename === "StatusContext") {
        const { status, conclusion } = mapStatusContextState(context.state);
        const summary = context.description?.trim() || undefined;
        return {
          name: context.context,
          status,
          conclusion,
          source: "status_context",
          detailsUrl: context.targetUrl ?? "",
          event: null,
          runId: null,
          ...(rollupIndex === 1 && { scope: "merge_group" as const }),
          ...(summary !== undefined && { summary }),
        };
      }
      const run = context.checkSuite?.workflowRun;
      const summary = extractCheckRunSummary(context.title, context.summary);
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
        ...(summary !== undefined && { summary }),
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
