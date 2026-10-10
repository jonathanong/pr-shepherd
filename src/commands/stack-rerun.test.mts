import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import type { PollSummaryItem } from "../types.mts";
import { withPollSummaryInstructions } from "./poll-summary-instructions.mts";
import { appendStackRerunInstruction } from "./stack-work.mts";

/** A layer another author owns: `owned` is only ever present as `true`. */
function unowned(pr: number, position: number): PollSummaryItem {
  const { owned: _owned, ...rest } = row(pr, position);
  return rest;
}

describe("stack rerun step", () => {
  const stop = "No owned layer needs a session. Report this overview and stop.";

  it("reruns the selector when an owned layer has work", () => {
    const steps = ["1. existing"];
    appendStackRerunInstruction(steps, [row(1, 1), unowned(2, 2)], "rerun");
    expect(steps).toEqual(["1. existing", "2. rerun"]);
  });

  it("stops instead of rerunning when only other authors' layers have work", () => {
    const steps: string[] = [];
    appendStackRerunInstruction(steps, [unowned(1, 1)], "rerun");
    expect(steps).toEqual([`1. ${stop}`]);
    const empty: string[] = [];
    appendStackRerunInstruction(empty, [], "rerun");
    expect(empty).toEqual(["1. rerun"]);
  });

  it("tells the caller to stop when every unready layer belongs to another author", () => {
    const result = withPollSummaryInstructions(stack([unowned(1, 1), unowned(2, 2)]), false);
    const text = result.instructions?.join("\n") ?? "";
    expect(result.nextAction).toBe("shepherd");
    expect(text).toContain(stop);
    expect(text).not.toContain("rerun this same `--stack` selector");
  });
});
