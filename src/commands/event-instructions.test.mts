import { describe, it, expect } from "vitest";
import { eventAggregateStep, eventFixContinuation, eventWaitSteps } from "./event-instructions.mts";
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

describe("event instructions", () => {
  it("wait steps end the turn and name the playbook and wake-up", () => {
    const [end, wake] = eventWaitSteps(SAFETY);
    expect(end).toContain('Playbook: "Cloud event loop"');
    expect(wake).toContain("safety-net wake-up at `2024-05-15T19:57:00Z`");
    expect(eventWaitSteps(DELAY)[1]).toContain(
      "Keep exactly one wake-up at `2024-05-15T19:09:00Z`",
    );
  });

  it("fix continuation reruns once then ends the turn", () => {
    const step = eventFixContinuation(SAFETY);
    expect(step).toContain("rerun this command once");
    expect(step).toContain('Playbook: "Cloud event loop"');
  });

  it("aggregate step differs while sessions still have work", () => {
    expect(eventAggregateStep(DELAY, true)).toContain("end this turn now");
    expect(eventAggregateStep(DELAY, false)).toContain("once the steps above are done");
    expect(eventAggregateStep(DELAY, false)).toContain("rerun this selector");
  });
});
