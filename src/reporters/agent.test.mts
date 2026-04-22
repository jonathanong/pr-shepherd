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
  body: "Please fix this method.",
  createdAtUnix: 1700000000,
};

const comment: PrComment = {
  id: "c-1",
  isMinimized: false,
  author: "bob",
  body: "Consider renaming.",
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
    failureKind: "actionable",
    logExcerpt: "error TS2345",
  };
}

describe("toAgentThread", () => {
  it("keeps id/path/line/author/body and drops isResolved/isOutdated/createdAtUnix", () => {
    const result = toAgentThread(thread);
    expect(result).toEqual({
      id: "t-1",
      path: "src/foo.mts",
      line: 10,
      author: "alice",
      body: "Please fix this method.",
    });
    expect(result).not.toHaveProperty("isResolved");
    expect(result).not.toHaveProperty("isOutdated");
    expect(result).not.toHaveProperty("createdAtUnix");
  });
});

describe("toAgentComment", () => {
  it("keeps id/author/body and drops isMinimized/createdAtUnix", () => {
    const result = toAgentComment(comment);
    expect(result).toEqual({ id: "c-1", author: "bob", body: "Consider renaming." });
    expect(result).not.toHaveProperty("isMinimized");
    expect(result).not.toHaveProperty("createdAtUnix");
  });
});

describe("toAgentCheck", () => {
  it("keeps name/runId/detailsUrl/failureKind and drops logExcerpt/conclusion/category", () => {
    const result = toAgentCheck(makeCheck("run-1"));
    expect(result).toEqual({
      name: "typecheck",
      runId: "run-1",
      detailsUrl: "https://github.com/owner/repo/actions/runs/run-1",
      failureKind: "actionable",
    });
    expect(result).not.toHaveProperty("logExcerpt");
    expect(result).not.toHaveProperty("conclusion");
    expect(result).not.toHaveProperty("category");
  });

  it("includes detailsUrl when runId is null", () => {
    const result = toAgentCheck(makeCheck(null, "external-check"));
    expect(result.runId).toBeNull();
    expect(result.detailsUrl).toBe("https://github.com/owner/repo/actions/runs/null");
  });
});

describe("toAgentChecks", () => {
  it("deduplicates checks sharing a runId, keeping the first", () => {
    const result = toAgentChecks([makeCheck("run-1", "typecheck"), makeCheck("run-1", "lint")]);
    expect(result).toHaveLength(1);
    expect(result[0]?.runId).toBe("run-1");
    expect(result[0]?.name).toBe("typecheck");
  });

  it("keeps checks with distinct runIds", () => {
    const result = toAgentChecks([makeCheck("run-1"), makeCheck("run-2")]);
    expect(result).toHaveLength(2);
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
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("status");
    expect(result[1]?.name).toBe("typecheck");
  });
});
