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

  it("sorts rows without stack positions after positioned layers", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(3, 3, { readyReceipt: true }),
        row(1, 1, { stack: undefined, readyReceipt: true }),
      ]),
      false,
    );
    expect(result.prs.map((item) => item.pr)).toEqual([3, 1]);
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

  it("rejects a receipt-bearing row without native-stack metadata", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, { readyReceipt: true, stack: undefined })]),
      false,
    );
    expect(result).toMatchObject({ nextAction: "fix_code", stackMergeable: false });
    expect(result.prs[0]).toMatchObject({ action: "fix_code" });
  });

  it.each([
    { mergeable: "CONFLICTING", mergeStateStatus: "BLOCKED" },
    { mergeable: "UNKNOWN", mergeStateStatus: "DIRTY" },
  ] as const)("rejects a stale queued receipt on hard conflict: %o", (override) => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, { readyReceipt: true, isInMergeQueue: true, ...override })]),
      true,
    );
    expect(result).toMatchObject({ nextAction: "fix_code", stackMergeable: false });
    expect(result.prs[0]).toMatchObject({ action: "fix_code" });
  });

  it("reprojects an effective queued CANCEL as WAIT without --merge", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { action: "cancel", readyReceipt: true, isInMergeQueue: true }),
        row(2, 2, { action: "cancel", readyReceipt: true, isInMergeQueue: true }),
      ]),
      false,
    );
    expect(result).toMatchObject({ nextAction: "wait", stackMergeable: true });
    expect(result.prs.map((item) => item.action)).toEqual(["wait", "wait"]);
  });

  it.each([
    ["a one-PR WAIT action", { action: "wait", reasons: ["waiting"], readyReceipt: true }],
    ["UNKNOWN raw mergeability", { mergeable: "UNKNOWN", readyReceipt: true }],
  ] satisfies Array<[string, Partial<PollSummaryItem>]>)(
    "never returns CANCEL for %s outside the queue",
    (_name, changes) => {
      const result = withPollSummaryInstructions(stack([row(1, 1, changes)]), false);
      expect(result.nextAction).toBe("fix_code");
      expect(result.nextAction).not.toBe("cancel");
    },
  );

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

  it.each([
    ["BLOCKED", {}],
    ["HAS_HOOKS", {}],
    ["pending CI", { checks: { inProgress: 1 } }],
  ] as const)("does not accept a READY receipt while the lower layer has %s", (_state, changes) => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, {
          readyReceipt: true,
          ...(typeof _state === "string" &&
            _state !== "pending CI" && { mergeStateStatus: _state }),
          ...changes,
        }),
        row(2, 2, { readyReceipt: true }),
      ]),
      false,
    );
    expect(result).toMatchObject({ nextAction: "fix_code", stackMergeable: false });
    expect(result.prs[0]?.action).toBe("fix_code");
    expect(result.instructions?.join("\n")).toContain("PR #1");
  });

  it("lets a row ESCALATE dominate while retaining another row's autonomous work", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, {
          action: "escalate",
          reasons: ["mark-ready-authorization-required"],
          isDraft: true,
          pollCommand: undefined,
        }),
        row(2, 2, {
          action: "fix_code",
          reasons: ["review-work"],
        }),
      ]),
      false,
    );
    expect(result).toMatchObject({ nextAction: "escalate", stackMergeable: false });
    expect(result.instructions?.join("\n")).toContain("PR #1");
    expect(result.instructions?.join("\n")).toContain("PR #2");
  });

  it("keeps available one-PR routes when a human decision and a missing command coexist", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, {
          action: "escalate",
          reasons: ["mark-ready-authorization-required"],
          isDraft: true,
        }),
        row(2, 2, { action: "fix_code", pollCommand: undefined }),
        row(3, 3, { action: "fix_code" }),
      ]),
      false,
    );
    expect(result.nextAction).toBe("escalate");
    expect(result.instructions?.join("\n")).toContain("pull/3 --until-terminal");
    expect(result.instructions?.join("\n")).toContain("PR #2 needs a one-PR session");
    expect(result.instructions?.join("\n")).toContain("PR #1 requires human action");
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

  it("routes a fully ready stack merge to an agent command and reconciles afterward", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { readyReceipt: true }),
        row(2, 2, { readyReceipt: true }),
        row(3, 3, { readyReceipt: true }),
      ]),
      true,
    );
    expect(result).toMatchObject({ nextAction: "merge", stackMergeable: true });
    expect(result.instructions?.[0]).toContain("gh extension install github/gh-stack");
    expect(result.instructions?.[1]).toContain(
      "GH_REPO=acme/widgets gh stack merge --yes --squash 9",
    );
    expect(result.instructions?.join("\n")).toContain("rerun this same `--stack --merge`");
  });

  it("merges a verified one-layer stack and returns CANCEL only after that layer merges", () => {
    const single = stack([
      row(1, 1, {
        readyReceipt: true,
        stack: { number: 9, size: 1, position: 1, baseRefName: "main" },
      }),
    ]);
    single.selection = { kind: "stack", anchor: 1, stackNumber: 9, stackSize: 1 };
    const ready = withPollSummaryInstructions(single, true);
    expect(ready).toMatchObject({ nextAction: "merge", stackMergeable: true });
    expect(ready.instructions?.[0]).toContain("gh extension install github/gh-stack");
    expect(ready.instructions?.[1]).toContain(
      "GH_REPO=acme/widgets gh stack merge --yes --squash 9",
    );

    const merged = withPollSummaryInstructions(
      {
        ...single,
        prs: [
          row(1, 1, {
            state: "MERGED",
            action: "cancel",
            reasons: ["merged"],
            stack: { number: 9, size: 1, position: 1, baseRefName: "main" },
          }),
        ],
      },
      true,
    );
    expect(merged).toMatchObject({ nextAction: "cancel", reason: "all_terminal" });
    expect(merged.instructions?.join("\n")).not.toContain("gh stack merge");
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
      nextAction: "wait",
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
    [
      "a merged row followed by an unknown state",
      [row(1, 1, { state: "MERGED" }), row(2, 2, { state: "UNKNOWN" })],
    ],
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

  it("routes a clean draft with auto-ready disabled without a human escalation", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, {
          action: "wait",
          reasons: ["draft-auto-mark-ready-disabled"],
          isDraft: true,
          pollCommand:
            "pr-shepherd https://github.com/acme/widgets/pull/1 --timeout 1s --debounce 0s --no-auto-mark-ready",
        }),
      ]),
      true,
    );
    expect(result).toMatchObject({ nextAction: "fix_code", stackMergeable: false });
    expect(result.prs[0]?.action).toBe("wait");
    expect(result.instructions?.join("\n")).toContain("pull/1 --timeout 1s");
    expect(result.instructions?.join("\n")).not.toContain("human action");
  });

  it("does not convert a quota warning into a third stack nextAction", () => {
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
    expect(result.nextAction).not.toBe("escalate");
  });

  it("escalates an unready layer when no one-PR command is available", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, { pollCommand: undefined }), row(2, 2), row(3, 3)]),
      false,
    );
    expect(result).toMatchObject({ nextAction: "escalate", stackMergeable: false });
    expect(result.instructions?.join("\n")).toContain("could not produce its command");
  });
});
