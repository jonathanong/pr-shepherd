import { EXIT } from "../exit-codes.mts";
import type { PollSummaryResult, ShepherdAction } from "../types.mts";
import { formatPollSummaryResult } from "./poll-summary-formatter.mts";

export function emitPollSummaryResult(
  result: PollSummaryResult,
  opts: { format: "text" | "json" },
): void {
  process.stdout.write(
    opts.format === "json" ? `${JSON.stringify(result)}\n` : `${formatPollSummaryResult(result)}\n`,
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
    const stackExitCode: Partial<Record<ShepherdAction, number>> = {
      escalate: EXIT.ESCALATE,
      fix_code: EXIT.FIX_CODE,
      merge: EXIT.MERGE,
      mark_ready: EXIT.MARK_READY,
      wait: EXIT.WAIT,
      cancel: EXIT.OK,
    };
    return stackExitCode[result.nextAction] ?? EXIT.OK;
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
