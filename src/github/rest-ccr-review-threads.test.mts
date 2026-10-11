import { describe, expect, it, vi } from "vitest";
import {
  comment,
  nextLink,
  prefix,
  repo,
  serve,
  wire,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { readRestFeedback } from "./rest-feedback-read.mts";

const threadsPath = `${prefix}/pulls/101/ccr/review_threads`;
const commentsPath = `${prefix}/pulls/101/comments`;

describe("the Claude Code proxy's CCR review-thread route", () => {
  // Observed: the route ignores per_page/page and returns every thread with no Link header.
  it("accepts more than one page of threads from a single unpaged response", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    const ids = Array.from({ length: 150 }, (_, index) => index + 1);
    await serve((request, response) => {
      const [path, query = ""] = request.path.split("?");
      if (path === threadsPath) {
        response.end(
          JSON.stringify(
            ids.map((id) => ({
              resolved: id % 2 === 0,
              outdated: false,
              path: "src/index.mts",
              line: id,
              comment_ids: [id],
            })),
          ),
        );
      } else if (path === commentsPath) {
        const second = query.includes("page=2");
        if (!second) response.setHeader("link", nextLink(commentsPath, 2));
        response.end(
          JSON.stringify((second ? ids.slice(100) : ids.slice(0, 100)).map((id) => comment(id))),
        );
      } else response.end("[]");
    });

    const result = await readRestFeedback(101, repo);

    expect(result.threads).toHaveLength(150);
    expect(result.threads.filter((thread) => thread.isResolved)).toHaveLength(75);
    const threadReads = wire.requests.filter((request) => request.path.startsWith(threadsPath));
    expect(threadReads.map((request) => request.path)).toEqual([`${threadsPath}?per_page=100`]);
  });

  it("surfaces the proxy's missing-PR 404 as an error, not as an unavailable route", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve((request, response) => {
      if (request.path.startsWith(threadsPath)) {
        response.statusCode = 404;
        response.end(
          JSON.stringify({ message: "Could not resolve to a PullRequest with the number of 101." }),
        );
      } else response.end("[]");
    });

    await expect(readRestFeedback(101, repo)).rejects.toMatchObject({ status: 404, exitCode: 69 });
  });

  it("keeps a generic CCR 404 as unavailable thread status", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve((request, response) => {
      if (request.path.startsWith(threadsPath)) {
        response.statusCode = 404;
        response.end(JSON.stringify({ message: "Not Found" }));
      } else if (request.path.startsWith(commentsPath)) response.end(JSON.stringify([comment(11)]));
      else response.end("[]");
    });

    const result = await readRestFeedback(101, repo);

    expect(result.threads[0]).not.toHaveProperty("isResolved");
    expect(result.unavailable).toContainEqual(
      expect.objectContaining({ field: "reviewThreads.status" }),
    );
  });
});
