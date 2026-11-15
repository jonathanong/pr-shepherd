import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/load.mts", () => ({ loadConfig: vi.fn() }));

import { buildCancelRunsInstruction } from "./in-progress-runs.mts";

describe("buildCancelRunsInstruction", () => {
  it("is a step only when some run has a cancel command", () => {
    const run = { runId: "7", workflowName: "CI", status: "IN_PROGRESS", concurrency: "none" };
    expect(buildCancelRunsInstruction([run])).toBeUndefined();
    expect(buildCancelRunsInstruction([])).toBeUndefined();
    const step = buildCancelRunsInstruction([{ ...run, cancelCommand: "gh run cancel 7 -R o/r" }]);
    expect(step).toBe(
      "If any item will need a code change, cancel run 7 now with its `cancel:` command, before editing; ignore errors for runs that already finished. If you will push nothing, leave every run running.",
    );
  });

  it("names every cancellable run and keeps the others running", () => {
    const base = { workflowName: "CI", status: "IN_PROGRESS", concurrency: "none" };
    const step = buildCancelRunsInstruction([
      { ...base, runId: "7", cancelCommand: "gh run cancel 7 -R o/r" },
      { ...base, runId: "8" },
      { ...base, runId: "9", cancelCommand: "gh run cancel 9 -R o/r" },
    ]);
    expect(step).toBe(
      "If any item will need a code change, cancel runs 7, 9 now with their `cancel:` commands, before editing; ignore errors for runs that already finished. Cancel no other run: a push does not cancel the rest, so cancelling them only discards their results. If you will push nothing, leave every run running.",
    );
  });
});
