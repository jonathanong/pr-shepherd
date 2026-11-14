import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import type { PollSummaryItem } from "../types.mts";
import { lowerReadyNote } from "./stack-merge-plan.mts";

const ready = { readyReceipt: true } as const;
const ALL = { kind: "all" } as const;
const through = (pr: number) => ({ kind: "through", pr }) as const;
const RERUN = "pr-shepherd stack https://github.com/acme/widgets/pull/3 --until-terminal --merge";

describe("lowerReadyNote", () => {
  const lagging = (overrides: Partial<PollSummaryItem> = {}) =>
    stack([row(1, 1, ready), row(2, 2, overrides), row(3, 3, ready)]);

  it("has nothing to say without a scope, for --merge-ready, or when nothing is ready", () => {
    expect(lowerReadyNote(lagging(), undefined, RERUN)).toBeUndefined();
    expect(lowerReadyNote(lagging(), { kind: "ready" }, RERUN)).toBeUndefined();
    expect(lowerReadyNote(stack([row(1, 1), row(2, 2)]), ALL, RERUN)).toBeUndefined();
    expect(lowerReadyNote(stack([row(1, 1, { state: "MERGED" })]), ALL, RERUN)).toBeUndefined();
  });

  it("has nothing to say when the target itself is ready", () => {
    const all = stack([row(1, 1, ready), row(2, 2, ready)]);
    expect(lowerReadyNote(all, ALL, RERUN)).toBeUndefined();
  });

  it("reports the ready layers, the lagging facts, and the explicit opt-in", () => {
    const note = lowerReadyNote(
      lagging({
        action: "triage",
        reasons: ["review-work"],
        isDraft: true,
        reviewDecision: "REVIEW_REQUIRED",
        checks: { failing: 2, inProgress: 1 },
        review: { actionable: 3 },
      }),
      ALL,
      RERUN,
    )!;
    expect(note).toContain("Owned layer #1 is ready");
    expect(note).toContain("#2 (action triage; reasons review-work; draft; review REVIEW_REQUIRED");
    expect(note).toContain("2 failing checks; 1 checks in progress; 3 actionable review items)");
    expect(note).toContain("Nothing was merged because `--merge` lands every layer");
    expect(note).toContain("Tell the user the lower layers are ready");
    expect(note).toContain("Only if the user asked to merge layers as they become ready");
    expect(note).toContain("--until-terminal --merge-ready`");
  });

  it("names --merge-through and falls back without a rerun command", () => {
    const base = stack([row(1, 1, ready), row(2, 2, { reasons: [] }), row(3, 3)]);
    const note = lowerReadyNote(base, through(3))!;
    expect(note).toContain("`--merge-through` lands every layer");
    expect(note).toContain("`stack` with `--merge-ready`");
    expect(note).toContain("#2 (action cancel); #3 (action cancel; reasons appears-ready) are not");
    const two = stack([row(1, 1, ready), row(2, 2, ready), row(3, 3)]);
    expect(lowerReadyNote(two, ALL, RERUN)).toContain("Owned layers #1, #2 are ready");
  });
});
