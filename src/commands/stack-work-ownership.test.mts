import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import type { PollSummaryResult } from "../types.mts";
import { withPollSummaryInstructions } from "./poll-summary-instructions.mts";

const text = (result: PollSummaryResult) => result.instructions?.join("\n") ?? "";

describe("stack session ownership wording", () => {
  it("does not emit a session command for a layer the viewer does not own", () => {
    const unowned = row(1, 1, { action: "triage", reasons: ["failing-checks"] });
    delete unowned.owned;
    const base = stack([unowned]);
    const result = withPollSummaryInstructions(
      { ...base, selection: { ...base.selection, owned: [2] } } as typeof base,
      false,
    );
    expect(text(result)).toContain("PR #1 is not owned. Do not run a session for it.");
    expect(text(result)).not.toContain("pull/1 --until-terminal");
    expect(text(result)).toContain("only for `owned` rows");
  });

  it("says every layer is the caller's when the whole stack is owned", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, { action: "triage", reasons: ["failing-checks"] })]),
      false,
    );
    expect(text(result)).toContain("none for layers without one");
    expect(text(result)).not.toContain("only for `owned` rows");
  });

  it("bounds branch updates in a merge plan that also delegates a session", () => {
    const base = stack([
      row(1, 1, { readyReceipt: true }),
      row(2, 2, { action: "triage", reasons: ["conflicts"], mergeable: "CONFLICTING" }),
      row(3, 3, { owned: false } as never),
    ]);
    const unowned = base.prs.map(({ owned, ...item }) =>
      item.pr === 3 ? item : { ...item, owned },
    );
    const listed = { ...base, prs: unowned, selection: { ...base.selection, owned: [1, 2] } };
    const result = withPollSummaryInstructions(listed as typeof base, true, undefined, {
      kind: "ready",
    });
    expect(result.nextAction).toBe("merge");
    expect(text(result)).toContain("Branch updates: unowned layer #3");
  });
});
