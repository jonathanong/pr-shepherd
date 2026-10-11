import { describe, expect, it } from "vitest";
import type { CheckRun } from "../types.mts";
import { classifyChecks, getCiVerdict } from "./classify.mts";

function check(overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    name: "web",
    status: "COMPLETED",
    conclusion: "CANCELLED",
    detailsUrl: "https://github.test/actions/runs/200",
    event: "pull_request",
    runId: "200",
    workflowId: "42",
    workflowName: "CI",
    startedAtUnix: 100,
    completedAtUnix: 110,
    ...overrides,
  };
}

// The vouchington#2687 shape: the cancelled run has the higher ID, the success ran later.
const laterLowerIdSuccess = (): CheckRun =>
  check({ conclusion: "SUCCESS", runId: "100", startedAtUnix: 105, completedAtUnix: 130 });

describe("cancelled required contexts (github/gh-stack#466)", () => {
  it("keeps a highest-ID cancellation of a required context failing", () => {
    const classified = classifyChecks([check(), laterLowerIdSuccess()], {
      requiredContexts: [" web "],
    });
    expect(classified.find((c) => c.conclusion === "CANCELLED")?.category).toBe("failing");
    expect(getCiVerdict(classified)).toMatchObject({ anyFailing: true, supersededNames: [] });
  });

  it("still supersedes the same shape for a context that is not required", () => {
    const classified = classifyChecks([check(), laterLowerIdSuccess()], {
      requiredContexts: ["static"],
    });
    expect(classified.find((c) => c.conclusion === "CANCELLED")?.category).toBe("superseded");
  });

  it("still supersedes a required context's cancellation when a higher-ID run exists", () => {
    const classified = classifyChecks(
      [check({ runId: "100" }), check({ conclusion: "SUCCESS", runId: "200" })],
      { requiredContexts: ["web"] },
    );
    expect(classified.find((c) => c.conclusion === "CANCELLED")?.category).toBe("superseded");
  });
});
