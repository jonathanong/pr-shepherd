import { describe, expect, it } from "vitest";
import { renderInProgressRun } from "./in-progress-run-format.mts";

const run = { runId: "7", workflowName: "CI", status: "IN_PROGRESS", concurrency: "none" };

describe("renderInProgressRun", () => {
  it("prints the run and its raw concurrency, and nothing else for a plain run", () => {
    expect(renderInProgressRun(run)).toBe(
      "- `7` — `CI` [status: IN_PROGRESS]\n  concurrency: none",
    );
  });

  it("adds the sibling summary, never-cancel tag and cancel command when present", () => {
    expect(
      renderInProgressRun({
        ...run,
        concurrency: "cancel-in-progress=true",
        failed: ["tests"],
        running: ["e2e", "lint"],
        neverCancel: "AI *",
        cancelCommand: "gh run cancel 7 -R o/r",
      }),
    ).toBe(
      [
        "- `7` — `CI` [status: IN_PROGRESS] [never-cancel: AI *] failed: tests · running: e2e, lint",
        "  concurrency: cancel-in-progress=true",
        "  cancel: `gh run cancel 7 -R o/r`",
      ].join("\n"),
    );
  });
});
