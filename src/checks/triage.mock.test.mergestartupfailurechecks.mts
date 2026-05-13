// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerHooks, makeCheck, mergeStartupFailureChecks } from "./triage.test-support.mts";

registerHooks();

describe("mergeStartupFailureChecks", () => {
  it("replaces duplicate check runs and removes superseded duplicates", () => {
    const original = [
      makeCheck({ name: "old first", runId: "run-1", conclusion: "FAILURE" }),
      makeCheck({ name: "old duplicate", runId: "run-1", conclusion: "FAILURE" }),
      makeCheck({ name: "status context", runId: null, conclusion: "FAILURE" }),
    ];
    const startup = [
      makeCheck({ name: "startup", runId: "run-1", conclusion: "STARTUP_FAILURE" }),
      makeCheck({ name: "new startup", runId: "run-2", conclusion: "STARTUP_FAILURE" }),
    ];

    expect(mergeStartupFailureChecks(original, startup).map((check) => check.name)).toEqual([
      "startup",
      "status context",
      "new startup",
    ]);
  });

  it("appends startup failures that do not have a runId", () => {
    const startup = makeCheck({
      name: "startup without run id",
      runId: null,
      conclusion: "STARTUP_FAILURE",
    });

    expect(mergeStartupFailureChecks([], [startup])).toEqual([startup]);
  });
});
