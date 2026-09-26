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

describe("formatStackOverview", () => {
  it("renders draft, review, ancestry, quota, and an escalate blocker", () => {
    const result = stack([
      item({
        pr: 322,
        action: "escalate",
        reasons: ["appears-ready", "fix-thrash"],
        isDraft: true,
        checks: { incomplete: true },
        authorLogin: "bob",
      }),
      item({
        pr: 323,
        checks: { inProgress: 3 },
        isInMergeQueue: true,
        stack: undefined,
        queueRemoval: { reason: null, createdAtUnix: 1 },
      }),
      item({ pr: 324, review: { actionable: 2, incomplete: true } }),
      item({ pr: 325, readyReceipt: true, checks: { inProgress: 4 } }),
    ]);
    result.instructions = ["1. Leave unowned layers."];
    result.stackMergeable = undefined;
    result.nextAction = undefined;
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
    result.quotaWarning = {
      resource: "graphql",
      thresholdPercent: 20,
      remaining: 900,
      limit: 5_000,
      resetAt: 2_000_000_000,
      pollIntervalMinutes: 5,
      pollTimeoutMinutes: 15,
    };
    result.apiUsage = {
      credentialSources: ["gh auth token"],
      graphql: {
        resource: "graphql",
        remaining: 900,
        limit: 5_000,
        resetAt: 2_000_000_000,
        requestCount: 1,
        measuredQueryCost: 2,
        unmeasuredRequestCount: 0,
        nodeCount: 10,
      },
    };
    const overview = projectStackOverview(result);
    expect(overview.prs[0]).toMatchObject({ blocker: "fix-thrash", isDraft: true, author: "bob" });
    expect(overview.prs[1]).toMatchObject({
      blocker: "queue-removal",
      queueRemoval: { reason: null },
    });
    expect(overview.prs[2]).toMatchObject({ blocker: "review-work", actionable: 2 });
    expect(overview.prs[3]).toMatchObject({ blocker: "checks-in-progress", inProgress: 4 });
    const text = formatStackOverview(overview);
    expect(text).toContain("1. Leave unowned layers.");
    expect(text).toContain("## Stack ancestry");
    expect(text).toContain("## GitHub API quota warning");
    expect(text).toContain("## GitHub API usage");
    expect(text).toContain("draft");
    expect(text).toContain("unknown reason");
    expect(text).toContain("shepherded · not mergeable (`checks-in-progress`)");
    expect(text).toContain("4 in progress");
    expect(text).toContain("2 actionable");
    expect(text).not.toContain("stackMergeable");
  });

  it("names an unknown blocker when a row is not mergeable without one", () => {
    const text = formatStackOverview({
      mode: "summary",
      repo: "acme/widgets",
      selection: { kind: "stack", anchor: 1, stackNumber: 1, stackSize: 1 },
      reason: "waiting",
      prs: [
        {
          pr: 1,
          title: "Bare",
          url: "https://github.com/acme/widgets/pull/1",
          state: "OPEN",
          shepherded: false,
          mergeable: false,
          baseRefName: "main",
        },
      ],
    });
    expect(text).toContain("not mergeable (`unknown`)");
    expect(text).not.toContain("nextAction");
  });
});
