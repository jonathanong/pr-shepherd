import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import { withPollSummaryInstructions } from "./poll-summary-instructions.mts";
import { planStackMerge } from "./stack-merge-plan.mts";
import { multiStackError } from "./stack-targets-error.mts";

const ready = { readyReceipt: true } as const;
const through = (pr: number) => ({ kind: "through", pr }) as const;

describe("--merge-through leaves layers above the target alone", () => {
  const layers = [row(1, 1, ready), row(2, 2, ready), row(3, 3, { action: "triage" })];

  it("starts no session for an upper layer when merging", () => {
    const plan = planStackMerge(stack(layers), through(2))!;
    const text = plan.instructions.join("\n");
    expect(plan.action).toBe("merge");
    expect(text).toContain("gh stack merge 2");
    expect(text).not.toContain("--until-terminal`.");
    expect(text).not.toMatch(/pull\/3 --until-terminal/);
  });

  it("starts no session for an upper layer while an in-scope layer lags", () => {
    const lagging = [row(1, 1, { action: "triage" }), row(2, 2), row(3, 3, { action: "triage" })];
    const result = withPollSummaryInstructions(stack(lagging), true, undefined, through(2));
    const text = result.instructions!.join("\n");
    expect(text).toMatch(/pull\/1 --until-terminal/);
    expect(text).not.toMatch(/pull\/3 --until-terminal/);
  });

  it("is not complete while an in-scope layer is closed without merging", () => {
    const closed = [row(1, 1, { state: "MERGED" }), row(2, 2, { state: "CLOSED" }), row(3, 3)];
    expect(planStackMerge(stack(closed), through(2))).toBeUndefined();
  });

  it("is complete once every in-scope layer merged", () => {
    const merged = [row(1, 1, { state: "MERGED" }), row(2, 2, { state: "MERGED" }), row(3, 3)];
    expect(planStackMerge(stack(merged), through(2))).toMatchObject({ action: "cancel" });
  });
});

describe("--merge-ready completion", () => {
  const ownedOnly = (rows: ReturnType<typeof row>[]) => ({
    ...stack(rows),
    selection: { kind: "stack" as const, anchor: 1, stackNumber: 1, stackSize: 3, owned: [1] },
  });

  it("stops once every owned layer merged, even with an unowned layer above", () => {
    const rows = [row(1, 1, { state: "MERGED" }), row(2, 2, { ...ready, owned: undefined })];
    expect(planStackMerge(ownedOnly(rows), { kind: "ready" })).toMatchObject({
      action: "cancel",
      instructions: [expect.stringContaining("#2 stays open outside it")],
    });
  });

  it("keeps going while an owned layer remains or was closed unmerged", () => {
    expect(
      planStackMerge(ownedOnly([row(1, 1), row(2, 2, ready)]), { kind: "ready" }),
    ).toBeUndefined();
    const closed = [row(1, 1, { state: "CLOSED" }), row(2, 2, { ...ready, owned: undefined })];
    expect(planStackMerge(ownedOnly(closed), { kind: "ready" })).toBeUndefined();
  });
});

describe("multiStackError singleton groups", () => {
  it("warns that a lone PR owns its whole stack", () => {
    const message = multiStackError(
      "acme/widgets",
      [
        { stack: 5, prs: [11], stackRefs: [] },
        { stack: 6, prs: [21, 22], stackRefs: [] },
        { stack: 7, prs: [], stackRefs: [7] },
      ],
      "merge",
      undefined,
    );
    const lines = message.split("\n");
    expect(lines[1]).toContain("This command owns every layer of that stack");
    expect(lines[2]).not.toContain("owns every layer");
    expect(lines[3]).not.toContain("owns every layer");
  });
});
