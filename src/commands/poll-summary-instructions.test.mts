/* eslint-disable max-lines */
import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import type { PollSummaryItem } from "../types.mts";
import { withPollSummaryInstructions } from "./poll-summary-instructions.mts";

describe("native-stack reconciliation", () => {
  it("requires one-PR completion receipts, not apparently clean GitHub rows", () => {
    const result = withPollSummaryInstructions(stack([row(1, 1), row(2, 2), row(3, 3)]), false);
    expect(result).toMatchObject({
      nextAction: "shepherd",
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
    expect(result).toMatchObject({ nextAction: "shepherd", stackMergeable: false });
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
    expect(result).toMatchObject({ nextAction: "shepherd", stackMergeable: false });
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
      expect(result.nextAction).toBe("shepherd");
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
    expect(result).toMatchObject({ nextAction: "shepherd", stackMergeable: false });
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
    expect(result.nextAction).toBe("shepherd");
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
    expect(result).toMatchObject({ nextAction: "shepherd", stackMergeable: false });
    expect(result.prs[0]?.action).toBe("fix_code");
    expect(result.instructions?.join("\n")).toContain("PR #1");
  });

  it("surfaces a row ESCALATE while shepherding another row's autonomous work", () => {
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
    expect(result).toMatchObject({ nextAction: "shepherd", stackMergeable: false });
    expect(result.prs.map((item) => item.action)).toEqual(["escalate", "fix_code"]);
    expect(result.instructions?.join("\n")).toContain("PR #1");
    expect(result.instructions?.join("\n")).toContain("PR #2");
    expect(result.instructions?.join("\n")).toContain("rerun this same `--stack` selector");
  });

  it("keeps a pure human ESCALATE terminal when no autonomous session remains", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, {
          action: "escalate",
          reasons: ["mark-ready-authorization-required"],
          isDraft: true,
          pollCommand: undefined,
        }),
        row(2, 2, { action: "cancel", readyReceipt: true }),
      ]),
      false,
    );

    expect(result.nextAction).toBe("escalate");
    expect(result.instructions?.join("\n")).toContain("PR #1 requires human action");
    expect(result.instructions?.join("\n")).not.toContain("rerun this same `--stack` selector");
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
    expect(result.nextAction).toBe("shepherd");
    expect(result.instructions?.join("\n")).toContain("pull/3 --until-terminal");
    expect(result.instructions?.join("\n")).toContain("PR #2 needs a one-PR session");
    expect(result.instructions?.join("\n")).toContain("PR #1 requires human action");
    expect(result.instructions?.join("\n")).toContain("rerun this same `--stack` selector");
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
    expect(result.nextAction).toBe("shepherd");
    expect(result.instructions?.join("\n")).toContain("PR #3");
    expect(result.instructions?.join("\n")).not.toContain("gh stack push");
  });

  it("merges a ready one-layer stack and returns CANCEL only after that layer merges", () => {
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
    expect(ready.instructions?.[0]).toContain(
      "GH_REPO=acme/widgets gh stack merge 1 --yes --squash",
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
    expect(result.nextAction).toBe("shepherd");
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
    expect(result).toMatchObject({ nextAction: "shepherd", stackMergeable: false });
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
    expect(result.nextAction).toBe("shepherd");
    expect(result.nextAction).not.toBe("escalate");
  });

  it("shepherds available sessions even when another unready layer has no command", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, { pollCommand: undefined }), row(2, 2), row(3, 3)]),
      false,
    );
    expect(result).toMatchObject({ nextAction: "shepherd", stackMergeable: false });
    expect(result.instructions?.join("\n")).toContain("could not produce its command");
    expect(result.instructions?.join("\n")).toContain("pull/2 --until-terminal");
  });

  it("escalates when no unready layer has a one-PR command", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { pollCommand: undefined }),
        row(2, 2, { pollCommand: undefined }),
        row(3, 3, { pollCommand: undefined }),
      ]),
      false,
    );
    expect(result).toMatchObject({ nextAction: "escalate", stackMergeable: false });
    expect(result.instructions?.join("\n")).toContain("could not produce its command");
    expect(result.instructions?.join("\n")).not.toContain("rerun this same `--stack` selector");
  });
});
