import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import type { PollSummaryItem } from "../types.mts";
import { withPollSummaryInstructions } from "./poll-summary-instructions.mts";
import { planPrefixDrain } from "./stack-drain.mts";
import { appendStackRerunInstruction } from "./stack-work.mts";

/** A layer another author owns: `owned` is only ever present as `true`. */
function unowned(pr: number, position: number): PollSummaryItem {
  const { owned: _owned, ...rest } = row(pr, position);
  return rest;
}

describe("stack rerun step", () => {
  const KEEP = "Keep watching until every layer is terminal";
  const stop = "No owned layer needs a session. Report this overview and stop.";

  it("reruns the stack command when an owned layer has work", () => {
    const steps = ["1. existing"];
    appendStackRerunInstruction(steps, [row(1, 1), unowned(2, 2)], "rerun");
    expect(steps).toEqual(["1. existing", expect.stringMatching(/^2\. rerun Keep watching/)]);
  });

  it.each([
    [
      "the literal stack command",
      "pr-shepherd stack 1 --merge --until-terminal",
      "rerun `pr-shepherd stack 1 --merge --until-terminal`;",
    ],
    ["the generic name without a command", undefined, "rerun this same `stack --merge` command;"],
  ] as const)("names %s after a prefix merge attempt", (_case, command, expected) => {
    const plan = planPrefixDrain(
      stack([row(1, 1, { readyReceipt: true, baseRefName: "main" }), row(2, 2)]),
      true,
      command,
    );
    expect(plan?.instructions.at(-1)).toContain(`After the merge attempt, ${expected}`);
  });

  it("omits the keep-watching directive when a human handoff can end the run", () => {
    const steps: string[] = [];
    appendStackRerunInstruction(steps, [row(1, 1)], "rerun", false);
    expect(steps).toEqual(["1. rerun"]);
  });

  it("stops instead of rerunning when only other authors' layers have work", () => {
    const steps: string[] = [];
    appendStackRerunInstruction(steps, [unowned(1, 1)], "rerun");
    expect(steps).toEqual([`1. ${stop}`]);
    const empty: string[] = [];
    appendStackRerunInstruction(empty, [], "rerun");
    expect(empty).toEqual([expect.stringMatching(/^1\. rerun Keep watching/)]);
  });

  it("prints the literal stack command and keeps watching non-terminal layers", () => {
    const rerun = "npx pr-shepherd stack https://github.com/o/r/pull/1 --until-terminal";
    const text = withPollSummaryInstructions(
      stack([row(1, 1), row(2, 2)]),
      false,
      rerun,
    ).instructions?.join("\n");
    expect(text).toContain(`rerun \`${rerun}\``);
    expect(text).toContain(KEEP);
  });

  it("tells the caller to stop when every unready layer belongs to another author", () => {
    const result = withPollSummaryInstructions(stack([unowned(1, 1), unowned(2, 2)]), false);
    const text = result.instructions?.join("\n") ?? "";
    expect(result.nextAction).toBe("escalate");
    expect(text).toContain(stop);
    expect(text).not.toContain("rerun this same `stack` command");
  });

  it("adds no quota cadence after the unowned-stack stop", () => {
    const result = withPollSummaryInstructions(
      {
        ...stack([unowned(1, 1), unowned(2, 2)]),
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
    expect(result.nextAction).toBe("escalate");
    expect(result.instructions?.at(-1)).toBe(`4. ${stop}`);
  });
});
