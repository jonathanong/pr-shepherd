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
    expect(text(result)).toContain("every layer is yours");
    expect(text(result)).not.toContain("only for `owned` rows");
  });
});
