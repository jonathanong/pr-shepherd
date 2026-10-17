import { describe, it, expect } from "vitest";
import { tickAggregateStep, tickWaitSteps } from "./tick-instructions.mts";
import type { NextCheck } from "../types/next-check.mts";

const SAFETY: NextCheck = {
  at: "2024-05-15T19:57:00Z",
  inSeconds: 3020,
  reason: "safety-net",
};
const DELAY: NextCheck = {
  at: "2024-05-15T19:09:00Z",
  inSeconds: 140,
  reason: "ready-delay",
};

describe("tick instructions", () => {
  it("wait steps end the turn and name the playbook and wake-up", () => {
    const [end, wake] = tickWaitSteps(SAFETY);
    expect(end).toContain('Playbook: "Event loop"');
    expect(wake).toContain("safety-net wake-up at `2024-05-15T19:57:00Z`");
    expect(tickWaitSteps(DELAY)[1]).toContain("Keep exactly one wake-up at `2024-05-15T19:09:00Z`");
  });

  it("aggregate step differs while sessions still have work", () => {
    expect(tickAggregateStep(DELAY, true)).toContain("End this turn now");
    expect(tickAggregateStep(DELAY, false)).toContain("Once the steps above are done");
    expect(tickAggregateStep(DELAY, false)).toContain("rerun this command with the same options");
  });
});
