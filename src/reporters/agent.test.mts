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
  url: "",
  createdAtUnix: 1700000000,
};

const comment: PrComment = {
  id: "c-1",
  isMinimized: false,
  author: "bob",
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

describe("toAgentThread", () => {
  it("keeps id/path/line/author/body and drops isResolved/isOutdated/createdAtUnix", () => {
    const result = toAgentThread(thread);
    expect(result).toEqual({
      id: "t-1",
      path: "src/foo.mts",
      line: 10,
      author: "alice",
      body: "Please fix this method.",
      url: "",
    });
    expect(result).not.toHaveProperty("isResolved");
    expect(result).not.toHaveProperty("isOutdated");
    expect(result).not.toHaveProperty("createdAtUnix");
  });

  it("omits startLine when null (single-line thread)", () => {
    const result = toAgentThread(thread);
    expect(result).not.toHaveProperty("startLine");
  });

  it("omits startLine when equal to line (same-line range)", () => {
    const result = toAgentThread({ ...thread, startLine: 10, line: 10 });
    expect(result).not.toHaveProperty("startLine");
  });

  it("includes startLine when it differs from line (multi-line range)", () => {
    const result = toAgentThread({ ...thread, startLine: 8, line: 10 });
    expect(result.startLine).toBe(8);
  });

  it("attaches parsed suggestion when body contains a ```suggestion fence", () => {
    const body = "```suggestion\nconst x = 1;\n```";
    const result = toAgentThread({
      ...thread,
      path: "src/foo.mts",
      line: 10,
      startLine: null,
      body,
    });
    expect(result.suggestion).toEqual({
      startLine: 10,
      endLine: 10,
      lines: ["const x = 1;"],
      author: "alice",
    });
  });

  it("omits suggestion when body has no suggestion fence", () => {
    const result = toAgentThread(thread);
    expect(result).not.toHaveProperty("suggestion");
  });

  it("omits suggestion when path is null (file-level comment)", () => {
    const body = "```suggestion\nconst x = 1;\n```";
    const result = toAgentThread({ ...thread, path: null, body });
    expect(result).not.toHaveProperty("suggestion");
  });
});

describe("toAgentComment", () => {
  it("keeps id/author/body and drops isMinimized/createdAtUnix", () => {
    const result = toAgentComment(comment);
    expect(result).toEqual({ id: "c-1", author: "bob", body: "Consider renaming.", url: "" });
    expect(result).not.toHaveProperty("isMinimized");
    expect(result).not.toHaveProperty("createdAtUnix");
  });
});

describe("toAgentCheck", () => {
  it("keeps name/runId/detailsUrl and drops conclusion/category/failureKind; omits failedStep when absent", () => {
    const result = toAgentCheck(makeCheck("run-1"));
    expect(result).toEqual({
      name: "typecheck",
      runId: "run-1",
      detailsUrl: "https://github.com/owner/repo/actions/runs/run-1",
    });
    expect(result).not.toHaveProperty("failureKind");
    expect(result).not.toHaveProperty("logExcerpt");
    expect(result).not.toHaveProperty("conclusion");
    expect(result).not.toHaveProperty("category");
  });

  it("includes detailsUrl when runId is null", () => {
    const result = toAgentCheck(makeCheck(null, "external-check"));
    expect(result.runId).toBeNull();
    expect(result.detailsUrl).toBe("https://github.com/owner/repo/actions/runs/null");
  });

  it("includes workflowName, jobName, failedStep, summary, logTail when present; omits when absent", () => {
    const check: TriagedCheck = {
      ...makeCheck("run-1"),
      workflowName: "CI",
      jobName: "tests",
      failedStep: "Run tests",
      summary: "2 tests failed",
      logTail: "FAILED: assertion error",
    };
    const result = toAgentCheck(check);
    expect(result.workflowName).toBe("CI");
    expect(result.jobName).toBe("tests");
    expect(result.failedStep).toBe("Run tests");
    expect(result.summary).toBe("2 tests failed");
    expect(result.logTail).toBe("FAILED: assertion error");

    const bare = toAgentCheck(makeCheck("run-2"));
    expect(bare).not.toHaveProperty("workflowName");
    expect(bare).not.toHaveProperty("jobName");
    expect(bare).not.toHaveProperty("failedStep");
    expect(bare).not.toHaveProperty("summary");
    expect(bare).not.toHaveProperty("logTail");
  });
});

describe("toAgentChecks", () => {
  it("keeps all checks with distinct runIds (no dedup by runId)", () => {
    const result = toAgentChecks([makeCheck("run-1", "typecheck"), makeCheck("run-2", "lint")]);
    expect(result).toHaveLength(2);
  });

  it("keeps both checks when they share a runId (each may have distinct job+logTail)", () => {
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
