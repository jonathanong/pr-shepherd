/* eslint-disable max-lines */
import { describe, expect, it } from "vitest";
import type { PollSummaryItem, PollSummaryResult } from "../types.mts";
import { withPollSummaryInstructions } from "./poll-summary-instructions.mts";

function row(
  pr: number,
  position: number,
  overrides: Partial<PollSummaryItem> = {},
): PollSummaryItem {
  return {
    pr,
    repo: "acme/widgets",
    title: `Layer ${pr}`,
    url: `https://github.com/acme/widgets/pull/${pr}`,
    action: "cancel",
    reasons: ["appears-ready"],
    state: "OPEN",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    headRefName: `layer-${pr}`,
    headRefOid: String(pr).padStart(40, "0"),
    baseRefName: position === 1 ? "main" : `layer-${pr - 1}`,
    stack: { number: 9, size: 3, position, baseRefName: "main" },
    pollCommand: `pr-shepherd https://github.com/acme/widgets/pull/${pr} --until-terminal`,
    ...overrides,
  };
}

function stack(prs: PollSummaryItem[], gap = false): PollSummaryResult {
  return {
    mode: "summary",
    repo: "acme/widgets",
    selection: { kind: "stack", anchor: 3, stackNumber: 9, stackSize: 3 },
    reason: "actionable",
    prs,
    ...(gap && {
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

describe("native-stack reconciliation", () => {
  it("requires one-PR completion receipts, not apparently clean GitHub rows", () => {
    const result = withPollSummaryInstructions(stack([row(1, 1), row(2, 2), row(3, 3)]), false);
    expect(result).toMatchObject({
      nextAction: "fix_code",
      stackMergeable: false,
      reason: "actionable",
    });
    expect(result.instructions?.join("\n")).toContain("PR #1");
    expect(result.instructions?.join("\n")).toContain("PR #3");
  });

  it("reports a ready linear stack only after every open layer has a receipt", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { readyReceipt: true }),
        row(2, 2, { readyReceipt: true }),
        row(3, 3, { readyReceipt: true }),
      ]),
      false,
    );
    expect(result).toMatchObject({
      nextAction: "cancel",
      stackMergeable: true,
      reason: "all_terminal",
    });
  });

  it("blocks every upper layer above a draft parent and routes all unready sessions", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { isDraft: true, action: "mark_ready" }),
        row(2, 2, { readyReceipt: true }),
        row(3, 3, { action: "fix_code", reasons: ["review-work"] }),
      ]),
      false,
    );
    expect(result).toMatchObject({ nextAction: "fix_code", stackMergeable: false });
    expect(result.prs[1]?.blockedByPr).toBe(1);
    expect(result.prs[2]?.blockedByPr).toBe(1);
    expect(result.instructions?.join("\n")).toContain("PR #1");
    expect(result.instructions?.join("\n")).toContain("PR #3");
  });

  it("keeps a blocked upper draft session bounded and forbids auto-mark-ready", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { isDraft: true, action: "mark_ready" }),
        row(2, 2, { isDraft: true, action: "mark_ready" }),
        row(3, 3, { readyReceipt: true }),
      ]),
      false,
    );
    expect(result.prs[1]?.pollCommand).toContain("--timeout 1s --debounce 0s --no-auto-mark-ready");
    expect(result.prs[1]?.pollCommand).not.toContain("--until-terminal");
  });

  it("does not mistake a conflicting lower layer for a ready stack", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, {
          action: "fix_code",
          reasons: ["merge-conflicts"],
          mergeable: "CONFLICTING",
          mergeStateStatus: "DIRTY",
        }),
        row(2, 2, { readyReceipt: true }),
        row(3, 3, { readyReceipt: true }),
      ]),
      false,
    );
    expect(result.nextAction).toBe("fix_code");
    expect(result.prs[2]?.blockedByPr).toBe(1);
    expect(result.instructions?.join("\n")).not.toContain("gh stack rebase");
  });

  it("routes stale ancestry to a one-PR session", () => {
    const result = withPollSummaryInstructions(
      stack(
        [
          row(1, 1, { readyReceipt: true }),
          row(2, 2, { readyReceipt: true }),
          row(3, 3, { readyReceipt: true }),
        ],
        true,
      ),
      false,
    );
    expect(result.nextAction).toBe("fix_code");
    expect(result.instructions?.join("\n")).toContain("PR #3");
    expect(result.instructions?.join("\n")).not.toContain("gh stack push");
  });

  it("offers only a full-stack merge after all receipts", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { readyReceipt: true }),
        row(2, 2, { readyReceipt: true }),
        row(3, 3, { readyReceipt: true }),
      ]),
      true,
    );
    expect(result).toMatchObject({ nextAction: "fix_code", stackMergeable: true });
    expect(result.instructions?.join("\n")).toContain("gh stack merge 9 --yes --merge");
  });

  it("keeps a queued stack nonterminal until every layer merges", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { readyReceipt: true, isInMergeQueue: true }),
        row(2, 2, { readyReceipt: true, isInMergeQueue: true }),
        row(3, 3, { readyReceipt: true, isInMergeQueue: true }),
      ]),
      true,
    );
    expect(result).toMatchObject({
      nextAction: "fix_code",
      reason: "waiting",
      stackMergeable: true,
    });
    expect(result.instructions?.join("\n")).not.toContain("gh stack merge");
  });

  it("escalates a closed dependency rather than merging past it", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { readyReceipt: true }),
        row(2, 2, { state: "CLOSED", action: "cancel", reasons: ["closed"] }),
        row(3, 3, { readyReceipt: true }),
      ]),
      true,
    );
    expect(result).toMatchObject({ nextAction: "escalate", stackMergeable: false });
    expect(result.instructions?.join("\n")).not.toContain("gh stack merge");
  });

  it.each([
    ["all terminal", [row(1, 1, { state: "MERGED" }), row(2, 2, { state: "UNKNOWN" })]],
    ["below an open layer", [row(1, 1, { state: "UNKNOWN" }), row(2, 2, { readyReceipt: true })]],
  ] as const)("escalates an unverified state %s", (_case, prs) => {
    const result = withPollSummaryInstructions(stack([...prs]), true);
    expect(result).toMatchObject({ nextAction: "escalate", stackMergeable: false });
    expect(result.instructions?.join("\n")).toContain("state `UNKNOWN`");
  });

  it("does not accept an incomplete handoff after only the parent finishes", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { readyReceipt: true }),
        row(2, 2, { readyReceipt: true }),
        row(3, 3, { isDraft: true, action: "mark_ready" }),
      ]),
      false,
    );
    expect(result.nextAction).toBe("fix_code");
    expect(result.instructions?.join("\n")).toContain("PR #3");
  });

  it("adds quota-aware continuation to an actionable stack handoff", () => {
    const result = withPollSummaryInstructions(
      {
        ...stack([row(1, 1), row(2, 2, { readyReceipt: true }), row(3, 3, { readyReceipt: true })]),
        quotaWarning: {
          resource: "graphql",
          thresholdPercent: 20,
          remaining: 100,
          limit: 1000,
          resetAt: 2_000_000_000,
          pollIntervalMinutes: 10,
          pollTimeoutMinutes: 20,
        },
      },
      false,
    );
    expect(result.nextAction).toBe("fix_code");
    expect(result.instructions?.at(-1)).toContain("After completing the stack action");
  });

  it("escalates an unready layer when no one-PR command is available", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, { pollCommand: undefined }), row(2, 2), row(3, 3)]),
      false,
    );
    expect(result).toMatchObject({ nextAction: "escalate", stackMergeable: false });
    expect(result.instructions?.[0]).toContain("could not produce its command");
  });
});
