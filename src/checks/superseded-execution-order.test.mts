import { describe, expect, it } from "vitest";
import type { CheckRun } from "../types.mts";
import { classifyChecks, getCiVerdict } from "./classify.mts";

function check(overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    name: "lint-links",
    status: "COMPLETED",
    conclusion: "CANCELLED",
    detailsUrl: "https://github.test/actions/runs/200",
    event: "pull_request",
    runId: "200",
    workflowId: "42",
    workflowName: "Lint Links",
    startedAtUnix: 100,
    completedAtUnix: 110,
    ...overrides,
  };
}

const success = (): CheckRun =>
  check({
    conclusion: "SUCCESS",
    runId: "100",
    startedAtUnix: 105,
    completedAtUnix: 130,
  });

describe("cancelled checks covered by later-executed lower-ID runs", () => {
  it.each([
    ["cancelled first", false],
    ["success first", true],
  ])("uses check execution order when listed %s", (_, reverse) => {
    const checks = reverse ? [success(), check()] : [check(), success()];
    const classified = classifyChecks(checks);
    const cancelled = classified.find((item) => item.conclusion === "CANCELLED");
    expect(cancelled?.category).toBe("superseded");
    expect(getCiVerdict(classified)).toMatchObject({
      anyFailing: false,
      allPassed: true,
      supersededNames: ["lint-links"],
    });
  });

  it.each([
    ["different check name", { name: "another-job" }],
    ["different workflow ID", { workflowId: "43" }],
    ["name-only workflow identity", { workflowId: undefined }],
    ["different event", { event: "workflow_dispatch" }],
    ["different scope", { scope: "merge_group" as const }],
    ["different commit", { commitOid: "other-commit" }],
    ["same run ID", { runId: "200" }],
    ["non-numeric success run ID", { runId: "not-a-run" }],
    ["pending success", { status: "IN_PROGRESS" as const }],
    ["failed witness", { conclusion: "FAILURE" as const }],
  ])("leaves cancellation failing for %s", (_, override) => {
    const [cancelled] = classifyChecks([check(), check({ ...success(), ...override })]);
    expect(cancelled?.category).toBe("failing");
  });

  it.each([
    ["missing cancelled start", { startedAtUnix: undefined }, {}],
    ["missing cancelled completion", { completedAtUnix: undefined }, {}],
    ["missing success start", {}, { startedAtUnix: undefined }],
    ["missing success completion", {}, { completedAtUnix: undefined }],
    ["nonpositive cancelled start", { startedAtUnix: 0 }, {}],
    ["nonpositive success completion", {}, { completedAtUnix: 0 }],
    ["nonfinite cancelled completion", { completedAtUnix: Number.NaN }, {}],
    ["nonfinite success start", {}, { startedAtUnix: Number.POSITIVE_INFINITY }],
    ["cancelled completion before start", { completedAtUnix: 99 }, {}],
    ["success completion before start", {}, { completedAtUnix: 104 }],
    ["same start", {}, { startedAtUnix: 100 }],
    ["same completion", {}, { completedAtUnix: 110 }],
    ["success starts earlier", {}, { startedAtUnix: 99 }],
    ["success completes earlier", {}, { completedAtUnix: 109 }],
  ])("leaves cancellation failing for %s", (_, cancelledOverride, successOverride) => {
    const [cancelled] = classifyChecks([
      check(cancelledOverride),
      check({ ...success(), ...successOverride }),
    ]);
    expect(cancelled?.category).toBe("failing");
  });

  it.each([null, "", "0", "-1", "1.5", "1e2", "9007199254740992"])(
    "rejects invalid cancelled run ID %s",
    (runId) => {
      const [cancelled] = classifyChecks([check({ runId }), success()]);
      expect(cancelled?.category).toBe("failing");
    },
  );

  it("keeps a genuinely later cancellation failing even when an earlier check succeeded", () => {
    const [cancelled] = classifyChecks([
      check({ startedAtUnix: 120, completedAtUnix: 140 }),
      success(),
    ]);
    expect(cancelled?.category).toBe("failing");
  });

  it("preserves pending and failing checks alongside a covered cancellation", () => {
    const classified = classifyChecks([
      check(),
      success(),
      check({ name: "another-job", runId: "150", status: "IN_PROGRESS", conclusion: null }),
      check({ name: "failed-job", runId: "175", conclusion: "FAILURE" }),
    ]);
    expect(classified.map((item) => item.category)).toEqual([
      "superseded",
      "passed",
      "in_progress",
      "failing",
    ]);
    expect(getCiVerdict(classified)).toMatchObject({ anyFailing: true, anyInProgress: true });
  });

  it("never covers a genuine failure or timeout", () => {
    for (const conclusion of ["FAILURE", "TIMED_OUT"] as const) {
      const [failed] = classifyChecks([check({ conclusion }), success()]);
      expect(failed?.category).toBe("failing");
    }
  });
});

describe("higher-ID supersession boundaries", () => {
  it.each([
    ["event", { event: "workflow_dispatch" }],
    ["scope", { scope: "merge_group" as const }],
    ["commit", { commitOid: "other-commit" }],
  ])("does not use a newer run across a different %s", (_, override) => {
    const [cancelled] = classifyChecks([
      check({ runId: "100" }),
      check({ runId: "200", conclusion: "SUCCESS", ...override }),
    ]);
    expect(cancelled?.category).toBe("failing");
  });

  it("retains workflow-name fallback within the same event and scope", () => {
    const [cancelled] = classifyChecks([
      check({ runId: "100", workflowId: undefined }),
      check({ runId: "200", workflowId: undefined, conclusion: "SUCCESS" }),
    ]);
    expect(cancelled?.category).toBe("superseded");
  });
});
