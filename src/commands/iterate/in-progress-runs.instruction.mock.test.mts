import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/load.mts", () => ({ loadConfig: vi.fn() }));

import { buildCancelRunsInstruction } from "./in-progress-runs.mts";

describe("buildCancelRunsInstruction", () => {
  it("is a step only when some run has a cancel command", () => {
    const run = { runId: "7", workflowName: "CI", status: "IN_PROGRESS", concurrency: "none" };
    expect(buildCancelRunsInstruction([run])).toBeUndefined();
    expect(buildCancelRunsInstruction([])).toBeUndefined();
    const step = buildCancelRunsInstruction([{ ...run, cancelCommand: "gh run cancel 7 -R o/r" }]);
    expect(step).toContain("run every `cancel:` under `## In-progress runs` now, before editing");
    expect(step).toContain("If you will push nothing, leave them running.");
  });
});
