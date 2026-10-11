import { describe, expect, it } from "vitest";
import type { MergeStatusResult } from "../types.mts";
import { withTrunkRequiredContexts } from "./required-check-requirements.mts";
import { formatMergeRequirementLines } from "./requirements-format.mts";

function status(stacked: boolean, parentContexts?: string[]): MergeStatusResult {
  return {
    status: "BLOCKED",
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    reviewDecision: null,
    blockingBotReviewInProgress: false,
    mergeStateStatus: "BLOCKED",
    mergeRequirements: {
      approvals: { current: 0, requiredCount: 0 },
      conversationsResolved: { resolved: true, unresolvedCount: 0, required: false },
      ...(parentContexts && { requiredStatusChecks: { contexts: parentContexts } }),
      ...(stacked && { stack: { number: 9, size: 2, position: 2, baseRefName: "main" } }),
    },
  };
}

describe("withTrunkRequiredContexts", () => {
  it("gives a stacked layer on a rule-less parent the trunk's contexts, named in text", () => {
    const { mergeRequirements } = withTrunkRequiredContexts(status(true), ["static", "web"]);
    expect(mergeRequirements?.requiredStatusChecks).toEqual({ contexts: ["static", "web"] });
    expect(formatMergeRequirementLines(mergeRequirements!)).toContain(
      "Required status checks: static, web [Required]",
    );
  });

  it("replaces the parent's contexts with the trunk's", () => {
    const { mergeRequirements } = withTrunkRequiredContexts(status(true, ["parent-only"]), ["web"]);
    expect(mergeRequirements?.requiredStatusChecks).toEqual({ contexts: ["web"] });
  });

  it("clears the parent's contexts when the trunk requires none", () => {
    const { mergeRequirements } = withTrunkRequiredContexts(status(true, ["parent-only"]), []);
    expect(mergeRequirements).not.toHaveProperty("requiredStatusChecks");
  });

  it("leaves a PR outside a stack untouched", () => {
    const original = status(false, ["lint"]);
    expect(withTrunkRequiredContexts(original, [])).toBe(original);
  });
});
