import { EXIT } from "../exit-codes.mts";
import type { PollSummaryResult, ShepherdAction, StackNextAction } from "../types.mts";
import { formatPollSummaryResult } from "./poll-summary-formatter.mts";
import { projectStackOverview } from "./stack-overview.mts";

export function emitPollSummaryResult(
  result: PollSummaryResult,
  opts: { format: "text" | "json" },
): void {
  process.stdout.write(
    opts.format === "json"
      ? `${JSON.stringify(result.selection.kind === "stack" ? projectStackOverview(result) : result)}\n`
      : `${formatPollSummaryResult(result)}\n`,
  );
  process.exitCode = pollSummaryExitCode(result);
}

function pollSummaryExitCode(result: PollSummaryResult): number {
  if (
    result.nextAction === "cancel" &&
    result.prs.some((item) => item.reasons.includes("closed"))
  ) {
    return EXIT.CLOSED;
  }
  if (result.nextAction) {
    const stackExitCode: Record<StackNextAction, number> = {
      escalate: EXIT.ESCALATE,
      shepherd: EXIT.SHEPHERD,
      merge: EXIT.MERGE,
      wait: EXIT.WAIT,
      cancel: EXIT.OK,
    };
    return stackExitCode[result.nextAction];
  }
  const actions = new Set<ShepherdAction>(result.prs.map((item) => item.action));
  if (actions.has("escalate")) return EXIT.ESCALATE;
  if (actions.has("fix_code")) return EXIT.FIX_CODE;
  if (actions.has("merge")) return EXIT.MERGE;
  if (actions.has("mark_ready")) return EXIT.MARK_READY;
  if (actions.has("wait")) return EXIT.WAIT;
  if (result.prs.some((item) => item.reasons.includes("closed"))) return EXIT.CLOSED;
  return EXIT.OK;
}
