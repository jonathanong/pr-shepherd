import { describe, expect, it, vi } from "vitest";
import { wire, serve, comment, repo } from "../../test-helpers/github/rest-read.test-support.mts";
import { readRestFeedback } from "./rest-feedback-read.mts";
import { readRestStackMembership } from "./rest-stack-read.mts";
import { resolveRestIdentity } from "./rest-identities.mts";
describe("REST feedback integrity", () => {
  it("joins the verified CCR comment_ids shape with complete reply chains", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve((request, response) => {
      const path = request.path.split("?")[0];
      if (path?.endsWith("/ccr/review_threads"))
        response.end(
          JSON.stringify([
            { resolved: true, outdated: false, path: null, line: null, comment_ids: [11, 12] },
          ]),
        );
      else if (path?.endsWith("/pulls/101/comments"))
        response.end(JSON.stringify([comment(11), comment(12, 11)]));
      else response.end("[]");
    });
    const result = await readRestFeedback(101, repo);
    expect(result.threads[0]).toMatchObject({
      id: "rest-thread-11",
      isResolved: true,
      isOutdated: false,
      path: null,
      line: null,
      comments: [{ id: "PRRC_11" }, { id: "PRRC_12" }],
    });
    expect(result.threads[0]).not.toHaveProperty("viewerCanResolve");
    expect(await resolveRestIdentity("PRRC_12", "comment")).toMatchObject({
      repo,
      pr: 101,
      numericId: "12",
    });
  });
  it("preserves unknown standard REST thread state and never calls CCR", async () => {
    await serve((request, response) =>
      response.end(
        JSON.stringify(
          request.path.split("?")[0]?.endsWith("/pulls/101/comments") ? [comment(11)] : [],
        ),
      ),
    );
    const result = await readRestFeedback(101, repo);
    expect(result.threads[0]).not.toHaveProperty("isResolved");
    expect(result.threads[0]).not.toHaveProperty("isOutdated");
    expect(result.unavailable).toContainEqual(
      expect.objectContaining({ field: "reviewThreads.status" }),
    );
    expect(wire.requests.some((request) => request.path.includes("ccr"))).toBe(false);
  });
  it("rejects an incomplete CCR join", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve((request, response) =>
      response.end(
        JSON.stringify(
          request.path.includes("ccr")
            ? [
                {
                  resolved: false,
                  outdated: false,
                  path: "src/index.mts",
                  line: 5,
                  comment_ids: [11, 12],
                },
              ]
            : request.path.split("?")[0]?.endsWith("/pulls/101/comments")
              ? [comment(11)]
              : [],
        ),
      ),
    );
    await expect(readRestFeedback(101, repo)).rejects.toThrow("comment missing");
  });
  it("does not treat unavailable native stack membership as standalone", async () => {
    await serve((_request, response) => {
      response.statusCode = 404;
      response.end('{"message":"Not Found"}');
    });
    await expect(readRestStackMembership(101, repo)).rejects.toMatchObject({ status: 404 });
  });
});
