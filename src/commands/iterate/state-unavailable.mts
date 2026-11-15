import type { EscalateDetails, IterateResult, IterateResultBase } from "../../types.mts";
import { buildEscalateHumanMessage, buildEscalateSuggestion } from "./escalate.mts";

type Extras = Partial<
  Pick<EscalateDetails, "firstLookSummaries" | "editedSummaries" | "pendingReviewCommands">
>;

/**
 * `stall-state-unavailable`: Shepherd could not read or save the state that bounds a repeated
 * situation (the stall timer, or an investigation marker), so it cannot detect a stuck loop.
 */
export function stateUnavailableResult(
  base: IterateResultBase,
  prReference: string,
  reason: string,
  extras: Extras = {},
): IterateResult {
  const escalateBase: Omit<EscalateDetails, "humanMessage"> = {
    triggers: ["stall-state-unavailable"],
    unresolvedThreads: [],
    ambiguousComments: [],
    changesRequestedReviews: [],
    ...extras,
    suggestion: buildEscalateSuggestion(["stall-state-unavailable"], reason),
  };
  return {
    ...base,
    action: "escalate",
    escalate: {
      ...escalateBase,
      humanMessage: buildEscalateHumanMessage(escalateBase, prReference),
    },
  };
}
