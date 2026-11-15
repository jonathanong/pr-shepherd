import { describe, expect, it } from "vitest";
import type { AgentCheck } from "../../types.mts";
import { buildCheckFollowUpInstructions } from "./check-follow-up.mts";

const check = (runId: string | null) => ({ runId }) as AgentCheck;

describe("buildCheckFollowUpInstructions", () => {
  it("names one `gh run view` per distinct run", () => {
    const [step] = buildCheckFollowUpInstructions([check("7"), check("7"), check("8")], "o/r");
    expect(step).toContain(
      "Start with `gh run view 7 -R o/r`, `gh run view 8 -R o/r`: it lists the run's jobs and annotations.",
    );
  });

  it("names no command when no check has a run", () => {
    const [step, outcome] = buildCheckFollowUpInstructions([check(null)], "o/r");
    expect(step).not.toContain("gh run view");
    expect(step).toContain('Find out before acting. Playbook: "Check follow-up".');
    expect(outcome).toContain("do not rerun or retrigger these checks");
  });
});
