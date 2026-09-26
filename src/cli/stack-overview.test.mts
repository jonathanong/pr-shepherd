import { describe, expect, it } from "vitest";

import type { PollSummaryItem, PollSummaryResult } from "../types.mts";
import { formatStackOverview, projectStackOverview } from "./stack-overview.mts";

function item(overrides: Partial<PollSummaryItem> = {}): PollSummaryItem {
  return {
    pr: 321,
    repo: "acme/widgets",
    title: "Foundation",
    url: "https://github.com/acme/widgets/pull/321",
    action: "wait",
    reasons: ["appears-ready"],
    state: "OPEN",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    headRefName: "foundation",
    headRefOid: "a".repeat(40),
    baseRefName: "main",
    stack: { number: 7, size: 2, position: 1, baseRefName: "main" },
    ...overrides,
  };
}

function stack(prs: PollSummaryItem[]): PollSummaryResult {
  return {
    mode: "summary",
    repo: "acme/widgets",
    selection: { kind: "stack", anchor: 321, stackNumber: 7, stackSize: prs.length },
    reason: "actionable",
    nextAction: "shepherd",
    prs,
  };
}

describe("projectStackOverview", () => {
  it("treats a missing receipt as not shepherded and still mergeable", () => {
    const [layer] = projectStackOverview(stack([item()])).prs;
    expect(layer).toMatchObject({
      pr: 321,
      shepherded: false,
      mergeable: true,
      position: 1,
      stackSize: 2,
      baseRefName: "main",
    });
    expect(layer?.blocker).toBeUndefined();
    expect(layer?.owned).toBeUndefined();
  });

  it("marks a current receipt shepherded and a viewer-authored layer owned", () => {
    const [layer] = projectStackOverview(
      stack([item({ readyReceipt: true, authorLogin: "Alice", owned: true })]),
    ).prs;
    expect(layer).toMatchObject({
      shepherded: true,
      mergeable: true,
      author: "Alice",
      owned: true,
    });
  });

  it("keeps one mergeability blocker and drops head SHAs and poll commands", () => {
    const overview = projectStackOverview(
      stack([
        item({
          checks: { failing: 1, passing: 4 },
          review: { actionable: 2 },
          pollCommand: "pr-shepherd 321",
          queueRemoval: { reason: "CI_FAILURE", actor: "github", createdAtUnix: 1 },
        }),
      ]),
    );
    expect(overview.prs[0]).toEqual({
      pr: 321,
      title: "Foundation",
      url: "https://github.com/acme/widgets/pull/321",
      state: "OPEN",
      shepherded: false,
      mergeable: false,
      blocker: "queue-removal",
      position: 1,
      stackSize: 2,
      baseRefName: "main",
      queueRemoval: { reason: "CI_FAILURE", actor: "github" },
    });
    expect(JSON.stringify(overview)).not.toContain("headRefOid");
    expect(JSON.stringify(overview)).not.toContain("pollCommand");
    expect(formatStackOverview(overview)).toContain(
      "not shepherded · not mergeable (`queue-removal`)",
    );
    expect(formatStackOverview(overview)).toContain(
      "removed from merge queue (CI_FAILURE by @github)",
    );
  });

  it("rejects a non-stack selection", () => {
    expect(() =>
      projectStackOverview({
        mode: "summary",
        repo: "acme/widgets",
        selection: { kind: "prs", requested: [1] },
        reason: "waiting",
        prs: [],
      }),
    ).toThrow(/stack selection/);
  });

  it("uses the escalate fallback when every reason is appears-ready", () => {
    const [layer] = projectStackOverview(
      stack([item({ action: "escalate", reasons: ["appears-ready"] })]),
    ).prs;
    expect(layer?.blocker).toBe("escalate");
  });

  it("reports stale ancestry ahead of a missing receipt", () => {
    const result = stack([item({ pr: 322, readyReceipt: true })]);
    result.stackAncestry = [
      {
        parentPr: 321,
        parentHeadRefName: "foundation",
        parentHeadRefOid: "a".repeat(40),
        childPr: 322,
        childBaseRefName: "foundation",
        childBaseRefOid: "b".repeat(40),
      },
    ];
    expect(projectStackOverview(result).prs[0]?.blocker).toBe("stale-ancestry");
  });
});
