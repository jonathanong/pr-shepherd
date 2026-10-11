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
    selection: {
      kind: "stack",
      anchor: 321,
      stackNumber: 7,
      stackSize: prs.length,
    },
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
      mergeable: true,
      position: 1,
      stackSize: 2,
      baseRefName: "main",
    });
    expect(layer?.shepherded).toBeUndefined();
    expect(layer?.blocker).toBeUndefined();
    expect(layer?.owned).toBeUndefined();
  });

  it("omits mergeability for a merged layer and the facts suffix when none apply", () => {
    const overview = projectStackOverview(stack([item({ state: "MERGED" })]));
    expect(overview.prs[0]?.mergeable).toBeUndefined();
    expect(overview.prs[0]?.blocker).toBeUndefined();
    expect(formatStackOverview(overview)).toContain(
      "- PR #321: Foundation\n  - MERGED · position 1/2 · base `main`",
    );
  });

  it("links a row only when its URL differs and omits a position the list order shows", () => {
    const overview = projectStackOverview(
      stack([item({ url: "https://github.example.com/acme/widgets/pull/321" })]),
    );
    overview.selection = { ...overview.selection, stackSize: 2 };
    overview.prs.push({
      ...overview.prs[0]!,
      pr: 322,
      position: 2,
      url: "https://github.com/acme/widgets/pull/322",
    });
    const text = formatStackOverview(overview);
    expect(text).toContain(
      "- [PR #321: Foundation](https://github.example.com/acme/widgets/pull/321)",
    );
    expect(text).toContain("- PR #322: Foundation");
    expect(text).not.toContain("position");
  });

  it("emits stackMergeable only when true", () => {
    const ready = { ...stack([item()]), stackMergeable: true };
    expect(projectStackOverview(ready).stackMergeable).toBe(true);
    expect(formatStackOverview(projectStackOverview(ready))).toContain("stackMergeable: true");
    const blocked = { ...stack([item()]), stackMergeable: false };
    expect(projectStackOverview(blocked).stackMergeable).toBeUndefined();
    expect(formatStackOverview(projectStackOverview(blocked))).not.toContain("stackMergeable");
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
          queueRemoval: {
            reason: "failed_checks",
            actor: "github",
            createdAtUnix: 1,
          },
        }),
      ]),
    );
    expect(overview.prs[0]).toEqual({
      pr: 321,
      title: "Foundation",
      url: "https://github.com/acme/widgets/pull/321",
      state: "OPEN",
      mergeable: false,
      blocker: "queue-removal",
      position: 1,
      stackSize: 2,
      baseRefName: "main",
      queueRemoval: { reason: "failed_checks", actor: "github" },
    });
    expect(JSON.stringify(overview)).not.toContain("headRefOid");
    expect(JSON.stringify(overview)).not.toContain("pollCommand");
    expect(formatStackOverview(overview)).toContain(
      "- PR #321: Foundation — not mergeable (`queue-removal`)",
    );
    expect(formatStackOverview(overview)).not.toContain("shepherded");
    expect(formatStackOverview(overview)).toContain(
      "removed from merge queue (failed_checks by @github)",
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

  it("preserves transport gaps in the layer projection and rendered overview", () => {
    const result = stack([
      item({
        transport: "rest",
        transportUnavailable: [
          {
            field: "queueMembership",
            reason: "No queue read endpoint was observed",
          },
        ],
      }),
    ]);
    const projected = projectStackOverview(result);
    expect(projected.prs[0]?.transportUnavailable).toEqual([
      {
        field: "queueMembership",
        reason: "No queue read endpoint was observed",
      },
    ]);
    expect(formatStackOverview(projected)).toContain(
      "unavailable `queueMembership`: No queue read endpoint was observed",
    );
  });
});
