import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import type { PollSummaryResult } from "../types.mts";
import { planStackMerge } from "./stack-merge-plan.mts";

const ready = { readyReceipt: true } as const;
const ALL = { kind: "all" } as const;
const RERUN = "pr-shepherd stack https://github.com/acme/widgets/pull/3 --until-terminal --merge";

function listed(result: PollSummaryResult, owned: number[]): PollSummaryResult {
  return {
    ...result,
    selection: { ...(result.selection as { kind: "stack" }), owned },
    prs: result.prs.map((item) => ({ ...item, owned: owned.includes(item.pr) })),
  } as PollSummaryResult;
}

function plan(result: PollSummaryResult, scope: Parameters<typeof planStackMerge>[1]) {
  return planStackMerge(result, scope, RERUN);
}

describe("planStackMerge escalations", () => {
  it("escalates when merging would land a layer the caller does not own", () => {
    const result = listed(stack([row(1, 1, ready), row(2, 2, ready), row(3, 3, ready)]), [2, 3]);
    const escalated = plan(result, ALL);
    expect(escalated).toMatchObject({ action: "escalate", stackMergeable: false });
    expect(escalated!.instructions[0]).toContain("`unowned-stack-layers`");
    expect(escalated!.instructions[0]).toContain('merging PR #3 also merges #1 ("Layer 1")');
    expect(escalated!.instructions[0]).toContain("never merge only #3");
    expect(escalated!.instructions[0]).toContain("pull/3 --until-terminal");
    expect(escalated!.instructions[0]).toMatch(
      /If the user's request already covers that layer \(they asked for the whole stack, or for every layer up to #3\), rerun .* with those PRs listed after `stack` now\. Otherwise stop/,
    );
  });

  it("names each unlisted layer with its author and prints both approval commands", () => {
    const result = listed(
      stack([
        row(1, 1, { ...ready, authorLogin: "alice", title: "Add parser" }),
        row(2, 2, { ...ready, authorLogin: "bob", title: "Add lexer" }),
        row(3, 3, ready),
      ]),
      [3],
    );
    const approve = (extra: number[]) => ({
      listed: `rerun --listed ${extra.join(",")}`,
      whole: "rerun --stack 9",
    });
    const escalated = planStackMerge(result, ALL, RERUN, approve)!;
    const text = escalated.instructions[0]!;
    expect(escalated.action).toBe("escalate");
    expect(text).toContain('#1 (@alice, "Add parser"), #2 (@bob, "Add lexer")');
    expect(text).toContain("tell the user that merging #3 also merges #1, #2");
    expect(text).toContain("`rerun --listed 1,2`");
    expect(text).toContain("`rerun --stack 9`");
    expect(text).toContain(
      "If the user's request already covers those layers (they asked for the whole stack, or for every layer up to #3), run `rerun --listed 1,2` now. Otherwise stop",
    );
  });

  it("escalates a through target whose lower layers are not listed", () => {
    const result = listed(stack([row(1, 1, ready), row(2, 2, ready), row(3, 3, ready)]), [2]);
    const escalated = planStackMerge(result, { kind: "through", pr: 2 }, RERUN)!;
    expect(escalated.action).toBe("escalate");
    expect(escalated.instructions[0]).toContain("merging PR #2 also merges #1");
  });

  it("never lands an unlisted layer through --merge-through", () => {
    const result = listed(stack([row(1, 1, ready), row(2, 2, ready), row(3, 3, ready)]), [1, 3]);
    const escalated = planStackMerge(result, { kind: "through", pr: 3 }, RERUN)!;
    expect(escalated.action).toBe("escalate");
    expect(escalated.instructions[0]).toContain("merging PR #3 also merges #2");
  });

  it("escalates instead of retargeting when the through PR was closed", () => {
    const result = listed(
      stack([row(1, 1, ready), row(2, 2, ready), row(3, 3, { state: "CLOSED" })]),
      [1, 2, 3],
    );
    const escalated = planStackMerge(result, { kind: "through", pr: 3 }, RERUN)!;
    expect(escalated.action).toBe("escalate");
    expect(escalated.instructions[0]).toContain("`merge-through-target-closed`");
    expect(escalated.instructions[0]).toContain("PR #3 was closed without merging");
    const gone = planStackMerge(result, { kind: "through", pr: 99 }, RERUN)!;
    expect(gone.instructions[0]).toContain("PR #99 is no longer a layer of this stack");
  });

  it("covers --merge-ready with the added-layer escalation", () => {
    const base = stack([row(1, 1, ready), row(2, 2, ready)]);
    const escalated = planStackMerge({ ...base, addedLayers: [2] }, { kind: "ready" }, RERUN)!;
    expect(escalated.action).toBe("escalate");
    expect(escalated.instructions[0]).toContain("`unapproved-stack-layer`");
    expect(escalated.instructions[0]).toContain("`--merge-ready` does not cover it");
  });

  it("escalates for a layer that joined after the request, singular and plural", () => {
    const base = stack([row(1, 1, ready), row(2, 2, ready)]);
    const one = plan({ ...base, addedLayers: [2] }, ALL)!.instructions[0]!;
    expect(one).toContain("`unapproved-stack-layer`");
    expect(one).toContain("PR #2 joined this stack");
    expect(one).toContain("does not cover it");
    expect(one).toContain("whether that layer is covered");
    const many = plan({ ...base, addedLayers: [1, 2] }, ALL)!.instructions[0]!;
    expect(many).toContain("PR #1, PR #2 joined this stack");
    expect(many).toContain("does not cover them");
    expect(many).toContain("whether those layers are covered");
  });
});
