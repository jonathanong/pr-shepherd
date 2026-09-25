import type { ShepherdReport, StackDraftHold } from "../../types.mts";

/**
 * A native stack draft this one-PR session cannot promote because automatic
 * mark-ready is off. A clean draft is marked ready on its own, without waiting
 * for lower layers.
 */
export function stackDraftHold(
  report: ShepherdReport,
  autoMarkReady: boolean,
): StackDraftHold | undefined {
  if (!report.mergeStatus.mergeRequirements?.stack || !report.mergeStatus.isDraft) return undefined;
  return autoMarkReady ? undefined : { kind: "auto-mark-ready-disabled" };
}
