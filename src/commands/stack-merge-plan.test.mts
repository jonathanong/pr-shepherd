import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import { freshLoadConfig } from "../../test-helpers/config/load-test-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import type { PollSummaryResult } from "../types.mts";
import { planStackMerge } from "./stack-merge-plan.mts";

const ready = { readyReceipt: true } as const;
const ALL = { kind: "all" } as const;
const through = (pr: number) => ({ kind: "through", pr }) as const;
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

describe("planStackMerge --merge", () => {
  it("returns nothing without a scope or open layers", () => {
    expect(planStackMerge(stack([row(1, 1, ready)]), undefined)).toBeUndefined();
    expect(planStackMerge(stack([row(1, 1, { state: "MERGED" })]), ALL)).toBeUndefined();
  });

  it("lands every listed layer in one command", () => {
    const result = plan(stack([row(1, 1, ready), row(2, 2, ready), row(3, 3, ready)]), ALL);
    expect(result).toMatchObject({ action: "merge", stackMergeable: true });
    const [step] = result!.instructions;
    expect(step).toContain("gh stack merge 3 --yes --squash");
    expect(step).toContain("PRs #1, #2, #3");
    expect(step).toContain("One command lands every listed layer");
    expect(step).toContain("Do not merge the layers one at a time with `gh pr merge`");
    expect(step).toContain("do not rebase or push between layers");
  });

  it("does not merge while an upper layer lags", () => {
    const lagging = stack([row(1, 1, ready), row(2, 2)]);
    expect(plan(lagging, ALL)).toBeUndefined();
  });

  it("stops once the scope is merged and leaves unowned layers to their owner", () => {
    const result = listed(stack([row(1, 1, { state: "MERGED" }), row(2, 2, ready)]), [1]);
    expect(plan(result, ALL)).toMatchObject({ action: "cancel", stackMergeable: true });
    expect(plan(result, ALL)!.instructions[0]).toContain("#2 stays open outside it");
    const two = listed(stack([row(1, 1, ready), row(2, 2, ready)]), [3]);
    expect(plan(two, ALL)!.instructions[0]).toContain("#1, #2 stay open outside it");
  });
});

describe("planStackMerge --merge-through", () => {
  it("merges up to the target and notes the layers left open above it", () => {
    const result = plan(stack([row(1, 1, ready), row(2, 2, ready), row(3, 3)]), through(2));
    expect(result).toMatchObject({ action: "merge" });
    const [step] = result!.instructions;
    expect(step).toContain("gh stack merge 2 --yes --squash");
    expect(step).toContain("PRs #1, #2");
    expect(step).toContain("#3 stays open above it;");
    expect(step).not.toContain("(owned)");
  });

  it("merges a single target alone", () => {
    const result = plan(stack([row(1, 1, ready), row(2, 2)]), through(1));
    expect(result!.instructions[0]).toContain("PR #1 alone");
  });

  it("states who owns the layers left above when only some PRs are listed", () => {
    const base = stack([row(1, 1, ready), row(2, 2), row(3, 3)]);
    expect(plan(listed(base, [1, 2, 3]), through(1))!.instructions[0]).toContain(
      "#2, #3 stay open above it (owned)",
    );
    expect(plan(listed(base, [1, 2]), through(1))!.instructions[0]).toContain(
      "(owned and unowned)",
    );
    expect(plan(listed(base, [1]), through(1))!.instructions[0]).toContain("(not owned)");
  });

  it("waits while a layer at or below the target lags", () => {
    expect(
      plan(stack([row(1, 1, ready), row(2, 2), row(3, 3, ready)]), through(3)),
    ).toBeUndefined();
  });

  it("escalates for an unowned layer below the target but not for one above", () => {
    const below = listed(stack([row(1, 1, ready), row(2, 2, ready)]), [2]);
    expect(plan(below, through(2))!.instructions[0]).toContain("`unowned-stack-layers`");
    const above = listed(stack([row(1, 1, ready), row(2, 2, ready)]), [1]);
    expect(plan(above, through(1))).toMatchObject({ action: "merge" });
    expect(plan(above, through(1))!.instructions[0]).toContain("#2 stays open above it");
  });
});

describe("planStackMerge --merge-ready", () => {
  it("merges the highest ready owned prefix and ends it at an unowned layer", () => {
    const base = stack([row(1, 1, ready), row(2, 2, ready), row(3, 3, ready)]);
    expect(plan(base, { kind: "ready" })!.instructions[0]).toContain("PRs #1, #2, #3");
    const partial = listed(base, [1, 3]);
    expect(plan(partial, { kind: "ready" })!.instructions[0]).toContain("PR #1 alone");
    expect(plan(stack([row(1, 1)]), { kind: "ready" })).toBeUndefined();
  });
});

describe("planStackMerge on REST", () => {
  it("scopes the guarded stack to the target and its lower layers", async () => {
    await freshLoadConfig();
    const result = stack([
      row(1, 1, { ...ready, transport: "rest", requiresMergeQueue: false }),
      row(2, 2, { ...ready, transport: "rest" }),
      row(3, 3, { ...ready, transport: "rest" }),
    ]);
    const merged = await runWithGithubTransport("rest", async () => plan(result, through(2)));
    const [step] = merged!.instructions;
    expect(step).toContain("--require-sha 0000000000000000000000000000000000000002");
    expect(step).toContain("PRs #1, #2");
    expect(step).toContain("One command lands every listed layer");
    const expected = /--expected-stack '(\{.*?\})'/.exec(step!)![1]!;
    expect(JSON.parse(expected).prefix.map((layer: { pr: number }) => layer.pr)).toEqual([1, 2]);
  });

  it("escalates when the REST merge route is unavailable", async () => {
    await freshLoadConfig();
    const result = {
      ...stack([row(1, 1, { ...ready, transport: "rest", requiresMergeQueue: false })]),
      allowedMergeMethods: [] as never[],
    };
    const merged = await runWithGithubTransport("rest", async () => plan(result, ALL));
    expect(merged).toMatchObject({ action: "escalate" });
  });
});

describe("planStackMerge when the merge method is unavailable", () => {
  it("escalates instead of printing a merge command", () => {
    const result = { ...stack([row(1, 1, ready)]), allowedMergeMethods: [] as never[] };
    expect(plan(result, ALL)).toMatchObject({ action: "escalate" });
  });
});
