// @ts-nocheck
import { describe, it, expect } from "vitest";
import { toAgentThread, toAgentComment, toAgentCheck, toAgentChecks } from "./agent.mts";
import type { ReviewThread, PrComment, TriagedCheck } from "../types.mts";

const thread: ReviewThread = {
  id: "t-1",
  isResolved: false,
  isOutdated: false,
  isMinimized: false,
  path: "src/foo.mts",
  line: 10,
  startLine: null,
  author: "alice",
  authorType: "User",
  body: "Please fix this method.",
  url: "",
  createdAtUnix: 1700000000,
};

const comment: PrComment = {
  id: "c-1",
  isMinimized: false,
  author: "bob",
  authorType: "Bot",
  body: "Consider renaming.",
  url: "",
  createdAtUnix: 1700000001,
};

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

describe("toAgentChecks", () => {
  it("keeps all checks with distinct runIds (no dedup by runId)", () => {
    const result = toAgentChecks([makeCheck("run-1", "typecheck"), makeCheck("run-2", "lint")]);
    expect(result).toHaveLength(2);
  });

  it("keeps both checks when they share a runId (each may have distinct job info)", () => {
    const result = toAgentChecks([makeCheck("run-1", "typecheck"), makeCheck("run-1", "lint")]);
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("typecheck");
    expect(result[1]?.name).toBe("lint");
  });

  it("deduplicates null-runId checks by name", () => {
    const result = toAgentChecks([makeCheck(null, "ext-check"), makeCheck(null, "ext-check")]);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("ext-check");
  });

  it("keeps distinct null-runId checks with different names", () => {
    const result = toAgentChecks([
      makeCheck(null, "status-check-1"),
      makeCheck(null, "status-check-2"),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("status-check-1");
    expect(result[1]?.name).toBe("status-check-2");
  });

  it("handles mixed null and non-null runIds", () => {
    const result = toAgentChecks([
      makeCheck(null, "status"),
      makeCheck("run-1", "typecheck"),
      makeCheck("run-1", "lint"),
    ]);
    // null-runId deduped by name; runId checks all kept
    expect(result).toHaveLength(3);
    expect(result[0]?.name).toBe("status");
    expect(result[1]?.name).toBe("typecheck");
    expect(result[2]?.name).toBe("lint");
  });
});
