import { describe, it, expect } from "vitest";
import { toAgentCheck } from "./agent.mts";
import type { TriagedCheck } from "../types.mts";

function makeCheck(runId: string | null, name = "typecheck"): TriagedCheck {
  return {
    name,
    status: "COMPLETED",
    conclusion: "FAILURE",
    detailsUrl: `https://github.com/owner/repo/actions/runs/${runId}`,
    event: "pull_request",
    runId,
    category: "failing",
  };
}

describe("toAgentCheck", () => {
  it("keeps name/runId/detailsUrl/conclusion and drops category/failureKind; omits failedStep when absent", () => {
    const result = toAgentCheck(makeCheck("run-1"));
    expect(result).toEqual({
      name: "typecheck",
      runId: "run-1",
      detailsUrl: "https://github.com/owner/repo/actions/runs/run-1",
      conclusion: "FAILURE",
    });
    expect(result).not.toHaveProperty("failureKind");
    expect(result).not.toHaveProperty("logExcerpt");
    expect(result).not.toHaveProperty("category");
  });

  it("preserves conclusion for CANCELLED checks", () => {
    const result = toAgentCheck({ ...makeCheck("run-1"), conclusion: "CANCELLED" });
    expect(result.conclusion).toBe("CANCELLED");
  });

  it("rejects skipped and neutral checks before projecting to agent output", () => {
    expect(() => toAgentCheck({ ...makeCheck("run-1"), conclusion: "SKIPPED" })).toThrow(
      "Unexpected conclusion SKIPPED",
    );
    expect(() => toAgentCheck({ ...makeCheck("run-2"), conclusion: "NEUTRAL" })).toThrow(
      "Unexpected conclusion NEUTRAL",
    );
  });

  it("includes detailsUrl when runId is null", () => {
    const result = toAgentCheck(makeCheck(null, "external-check"));
    expect(result.runId).toBeNull();
    expect(result.detailsUrl).toBe("https://github.com/owner/repo/actions/runs/null");
  });

  it("includes workflowName, jobName, failedStep, summary, logExcerpt when present; omits when absent", () => {
    const check: TriagedCheck = {
      ...makeCheck("run-1"),
      workflowName: "CI",
      jobName: "tests",
      failedStep: "Run tests",
      summary: "2 tests failed",
      logExcerpt: '"test-playwright": {"result": "failure"}',
    };
    const result = toAgentCheck(check);
    expect(result.workflowName).toBe("CI");
    expect(result.jobName).toBe("tests");
    expect(result.failedStep).toBe("Run tests");
    expect(result.summary).toBe("2 tests failed");
    expect(result.logExcerpt).toBe('"test-playwright": {"result": "failure"}');

    const bare = toAgentCheck(makeCheck("run-2"));
    expect(bare).not.toHaveProperty("workflowName");
    expect(bare).not.toHaveProperty("jobName");
    expect(bare).not.toHaveProperty("failedStep");
    expect(bare).not.toHaveProperty("summary");
    expect(bare).not.toHaveProperty("logExcerpt");
  });
});
