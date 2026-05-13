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

describe("toAgentComment", () => {
  it("keeps id/author/body and drops isMinimized/createdAtUnix", () => {
    const result = toAgentComment(comment);
    expect(result).toEqual({
      id: "c-1",
      author: "bob",
      authorType: "Bot",
      body: "Consider renaming.",
      url: "",
    });
    expect(result).not.toHaveProperty("isMinimized");
    expect(result).not.toHaveProperty("createdAtUnix");
  });
});
