import { describe, expect, it } from "vitest";
import type { PollSummaryItem, PollSummaryResult } from "../types.mts";
import { withPollSummaryInstructions } from "./poll-summary-instructions.mts";

function row(
  pr: number,
  position: number,
  action: PollSummaryItem["action"],
  overrides: Partial<PollSummaryItem> = {},
): PollSummaryItem {
  return {
    pr,
    repo: "acme/widgets",
    title: `Layer ${pr}`,
    url: `https://github.com/acme/widgets/pull/${pr}`,
    action,
    reasons: [action],
    state: "OPEN",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    headRefName: `layer-${pr}`,
    headRefOid: String(pr).padStart(40, "0"),
    baseRefName: position === 1 ? "main" : `layer-${pr - 1}`,
    stack: { number: 9, size: 3, position, baseRefName: "main" },
    ...overrides,
  };
}

function stack(prs: PollSummaryItem[], mismatched = true): PollSummaryResult {
  return {
    mode: "summary",
    repo: "acme/widgets",
    selection: { kind: "stack", anchor: 3, stackNumber: 9, stackSize: 3 },
    reason: "actionable",
    prs,
    ...(mismatched && {
      stackAncestry: [
        {
          parentPr: 2,
          parentHeadRefName: "layer-2",
          parentHeadRefOid: "b".repeat(40),
          childPr: 3,
          childBaseRefName: "layer-2",
          childBaseRefOid: "a".repeat(40),
        },
      ],
    }),
  };
}

describe("native-stack instructions", () => {
  const quotaWarning = {
    resource: "graphql" as const,
    thresholdPercent: 20,
    remaining: 100,
    limit: 1000,
    resetAt: 2_000_000_000,
    pollIntervalMinutes: 10,
    pollTimeoutMinutes: 20,
  };

  it("repairs a CLEAN upper layer when merge mode is off", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, "cancel"), row(2, 2, "cancel"), row(3, 3, "wait")]),
      false,
    );
    expect(result.reason).toBe("actionable");
    expect(result.nextAction).toBe("fix_code");
    expect(result.instructions?.join("\n")).toContain("gh stack rebase --upstack --no-trunk");
    expect(result.instructions?.join("\n")).toContain("gh stack push");
  });

  it("merges only the ready contiguous lower group before fixing the upper layer", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, "merge"), row(2, 2, "merge"), row(3, 3, "merge")]),
      true,
    );
    expect(result.nextAction).toBe("merge");
    expect(result.instructions?.[0]).toContain("gh stack merge --squash 2");
    expect(result.instructions?.[0]).toContain("leaves higher layers open");
    expect(result.instructions?.[0]).not.toContain("--squash 3");
  });

  it("handles lower-layer review work before restacking", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, "fix_code", { pollCommand: "pr-shepherd 1 --until-terminal" }),
        row(2, 2, "cancel"),
        row(3, 3, "wait"),
      ]),
      false,
    );
    expect(result.nextAction).toBe("fix_code");
    expect(result.instructions?.[0]).toContain("PR #1");
    expect(result.instructions?.[0]).toContain("pr-shepherd 1 --until-terminal");
    expect(result.instructions?.join("\n")).not.toContain("gh stack rebase");
  });

  it("stops only after every open layer is ready and ancestry is linear", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, "cancel"), row(2, 2, "cancel"), row(3, 3, "cancel")], false),
      false,
    );
    expect(result.nextAction).toBe("cancel");
    expect(result.reason).toBe("all_terminal");
  });

  it("does not merge past a waiting lower layer", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, "wait"), row(2, 2, "merge"), row(3, 3, "merge")]),
      true,
    );
    expect(result.nextAction).toBe("wait");
    expect(result.reason).toBe("waiting");
  });

  it("repairs a bottom layer behind the stack base instead of waiting forever", () => {
    const result = withPollSummaryInstructions(
      stack(
        [row(1, 1, "wait", { mergeStateStatus: "BEHIND" }), row(2, 2, "wait"), row(3, 3, "wait")],
        false,
      ),
      true,
    );
    expect(result.nextAction).toBe("fix_code");
    expect(result.instructions?.join("\n")).toContain("gh stack rebase");
  });

  it("adds quota-aware continuation after actionable stack work", () => {
    const result = withPollSummaryInstructions(
      { ...stack([row(1, 1, "cancel"), row(2, 2, "cancel"), row(3, 3, "wait")]), quotaWarning },
      false,
    );
    expect(result.nextAction).toBe("fix_code");
    expect(result.instructions?.at(-1)).toContain("After completing the stack action");
  });

  it("paces a waiting stack when GitHub reports a quota warning", () => {
    const result = withPollSummaryInstructions(
      {
        ...stack([row(1, 1, "wait"), row(2, 2, "wait"), row(3, 3, "wait")], false),
        quotaWarning,
      },
      false,
    );
    expect(result.nextAction).toBe("wait");
    expect(result.instructions?.[0]).toContain("Before continuing");
  });

  it("escalates an actionable layer when no one-PR command is available", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, "fix_code"), row(2, 2, "wait"), row(3, 3, "wait")], false),
      false,
    );
    expect(result.nextAction).toBe("escalate");
    expect(result.instructions?.[0]).toContain("no one-PR poll command");
  });
});
