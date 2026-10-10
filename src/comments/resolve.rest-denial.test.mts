import { describe, expect, it, vi } from "vitest";
import {
  wire,
  serve,
  repo,
  prefix,
  comment,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { applyResolveOptions } from "./resolve.mts";
import { loadSeenMap, markSeen, mutationWasDenied } from "../state/seen-comments.mts";
import { readRestFeedback } from "../github/rest-feedback-read.mts";
import { threadTranscriptBody } from "../threads/transcript.mts";

describe("REST server authorization results", () => {
  it("retains a denied displayed revision when the follow-up feedback read also fails", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    const key = { owner: repo.owner, repo: repo.name, pr: 101 };
    await markSeen(key, "rest-thread-11", "Displayed reviewer request");
    await serve((_request, response) => {
      response.statusCode = 403;
      response.end('{"message":"Resource not accessible by integration"}');
    });
    const result = await runWithGithubTransport("rest", () =>
      applyResolveOptions(101, repo, { resolveThreadIds: ["rest-thread-11"] }),
    );
    expect(result.errors).toEqual([expect.stringContaining("403")]);
    const seen = await loadSeenMap(key);
    expect(mutationWasDenied("rest-thread-11", "Displayed reviewer request", seen)).toBe(true);
    expect(mutationWasDenied("rest-thread-11", "Edited reviewer request", seen)).toBe(false);
    expect(wire.requests.filter(({ method }) => method === "POST")).toHaveLength(1);
  });
  it("records a definite denied resolve and suppresses retries until the feedback is edited", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    let body = "Reviewer request";
    await serve((request, response) => {
      const path = request.path.split("?")[0];
      if (request.method === "POST") {
        response.statusCode = 403;
        response.end('{"message":"Resource not accessible by integration"}');
      } else if (path?.endsWith("ccr/review_threads"))
        response.end(
          JSON.stringify([
            { resolved: false, outdated: false, path: "src/index.mts", line: 5, comment_ids: [11] },
          ]),
        );
      else
        response.end(
          JSON.stringify(path === `${prefix}/pulls/101/comments` ? [{ ...comment(11), body }] : []),
        );
    });
    const result = await runWithGithubTransport("rest", () =>
      applyResolveOptions(101, repo, { resolveThreadIds: ["rest-thread-11"] }),
    );
    expect(result.resolvedThreads).toEqual([]);
    expect(result.errors).toEqual([expect.stringContaining("403")]);
    expect(result.rateLimit).toBeUndefined();
    const seen = await loadSeenMap({ owner: repo.owner, repo: repo.name, pr: 101 });
    const before = (await readRestFeedback(101, repo)).threads[0]!;
    expect(mutationWasDenied(before.id, threadTranscriptBody(before), seen)).toBe(true);
    body = "Edited reviewer request";
    const after = (await readRestFeedback(101, repo)).threads[0]!;
    expect(mutationWasDenied(after.id, threadTranscriptBody(after), seen)).toBe(false);
    expect(wire.requests.filter((request) => request.method === "POST")).toHaveLength(1);
  });
  it("does not record a transient secondary throttle as an authorization denial", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve((_request, response) => {
      response.statusCode = 403;
      response.setHeader("retry-after", "30");
      response.end('{"message":"You have exceeded a secondary rate limit"}');
    });
    const result = await runWithGithubTransport("rest", () =>
      applyResolveOptions(101, repo, { resolveThreadIds: ["rest-thread-11", "rest-thread-12"] }),
    );
    expect(result.rateLimit).toMatchObject({ retryAfterSeconds: 30 });
    expect(result.unresolvedThreads).toEqual(["rest-thread-11", "rest-thread-12"]);
    expect((await loadSeenMap({ owner: repo.owner, repo: repo.name, pr: 101 })).size).toBe(0);
    expect(wire.requests).toHaveLength(1);
  });
});
