import { describe, expect, it } from "vitest";
import { classifyChecks } from "../checks/classify.mts";
import { evaluateRequiredChecks } from "../checks/required-check-state.mts";
import type { CheckRun, MergeStatusResult } from "../types.mts";
import { withRequiredCheckState } from "./required-check-requirements.mts";
import {
  blockedReasonFromRequirements,
  formatMergeRequirementLines,
} from "./requirements-format.mts";

function check(overrides: Partial<CheckRun>): CheckRun {
  return {
    name: "web",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: "https://github.com/o/r/actions/runs/1/job/2",
    event: "pull_request",
    runId: "1",
    workflowId: "10",
    ...overrides,
  };
}

// A stacked layer: its own base carries no rules, so requirements start with no checks.
function layerStatus(): MergeStatusResult {
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
      conversationsResolved: {
        resolved: true,
        unresolvedCount: 0,
        required: false,
      },
      stack: { number: 9, size: 2, position: 2, baseRefName: "main" },
    },
  };
}

const TRUNK_CONTEXTS = ["static", "web", "gitleaks"];

describe("evaluateRequiredChecks", () => {
  it("treats a newer success as superseding an older cancelled run of the same workflow", () => {
    const checks = classifyChecks([
      check({ name: "web", conclusion: "CANCELLED", runId: "1" }),
      check({ name: "web", conclusion: "SUCCESS", runId: "2" }),
    ]);
    expect(evaluateRequiredChecks(["web"], checks)).toEqual({ failing: [], pending: [] });
  });

  it("groups failing and pending contexts, ignoring passing ones and contexts with no run", () => {
    const checks = classifyChecks([
      check({ name: "static", conclusion: "FAILURE", workflowId: "1" }),
      check({
        name: "web",
        status: "IN_PROGRESS",
        conclusion: null,
        workflowId: "2",
      }),
      check({ name: "gitleaks", conclusion: "SUCCESS", workflowId: "3" }),
    ]);
    expect(evaluateRequiredChecks(["static", "web", "gitleaks", "tooling"], checks)).toEqual({
      failing: ["static"],
      pending: ["web"],
    });
  });

  it("reports a context pending when every run was superseded and no replacement reported", () => {
    const checks = classifyChecks([
      check({
        name: "web",
        conclusion: "CANCELLED",
        workflowId: "5",
        runId: "1",
      }),
      check({
        name: "other",
        conclusion: "SUCCESS",
        workflowId: "5",
        runId: "2",
      }),
    ]);
    expect(evaluateRequiredChecks(["web"], checks).pending).toEqual(["web"]);
  });
});

describe("stacked layer required checks (rule-less parent base)", () => {
  it("reports the trunk's required contexts as passing, not blocking", () => {
    const checks = classifyChecks(
      TRUNK_CONTEXTS.flatMap((name, i) => [
        check({
          name,
          conclusion: "CANCELLED",
          workflowId: String(i),
          runId: String(100 + i),
        }),
        check({
          name,
          conclusion: "SUCCESS",
          workflowId: String(i),
          runId: String(200 + i),
        }),
      ]),
    );
    const { mergeRequirements } = withRequiredCheckState(layerStatus(), TRUNK_CONTEXTS, checks);
    expect(mergeRequirements?.requiredStatusChecks).toEqual({
      contexts: TRUNK_CONTEXTS,
    });
    expect(formatMergeRequirementLines(mergeRequirements!)).toContain(
      "Required status checks: 3 [Required]",
    );
    expect(blockedReasonFromRequirements(mergeRequirements)).toBeNull();
  });

  it("names the failing and pending trunk contexts as the blocker", () => {
    const checks = classifyChecks([
      check({ name: "static", conclusion: "FAILURE", workflowId: "1" }),
      check({
        name: "web",
        status: "IN_PROGRESS",
        conclusion: null,
        workflowId: "2",
      }),
    ]);
    const { mergeRequirements } = withRequiredCheckState(layerStatus(), TRUNK_CONTEXTS, checks);
    expect(mergeRequirements?.requiredStatusChecks).toEqual({
      contexts: TRUNK_CONTEXTS,
      failing: ["static"],
      pending: ["web"],
    });
    expect(formatMergeRequirementLines(mergeRequirements!)).toContain(
      "Required status checks: 3 [Required] — failing: static; pending: web",
    );
    // The requirement line already names them; the blocked reason does not repeat it.
    expect(blockedReasonFromRequirements(mergeRequirements)).toBeNull();
  });

  it("leaves the status untouched when the merge target has no required contexts", () => {
    const status = layerStatus();
    expect(withRequiredCheckState(status, [], [])).toBe(status);
  });
});
