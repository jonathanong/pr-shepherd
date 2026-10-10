import { describe, expect, it } from "vitest";
import { wire, serve, repo, prefix } from "../../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { recordRestIdentity } from "../github/rest-identities.mts";
import { loadSeenMap, mutationWasDenied } from "../state/seen-comments.mts";
import { applyRestReviewChunk } from "./rest-review-mutations.mts";

const empty = {
  repo,
  pr: 101,
  replyIds: [] as string[],
  resolveIds: [] as string[],
  minimizeIds: [] as string[],
  dismissIds: [] as string[],
  message: "Reviewed and fixed.",
};
const review = {
  id: 77,
  node_id: "PRR_opaque",
  body: "Please update the API contract.",
  html_url: "https://github.com/octocat/hello-world/pull/101#pullrequestreview-77",
  created_at: "2026-10-09T00:00:00Z",
  updated_at: "2026-10-09T00:00:00Z",
  user: { login: "reviewer", type: "User" },
  author_association: "MEMBER",
  state: "COMMENTED",
  commit_id: "abc123",
  submitted_at: "2026-10-09T00:00:00Z",
};

describe("REST review mutation contracts", () => {
  it("resolves an opaque review ID from the PR review list and reports unknown IDs", async () => {
    await serve((request, response) => {
      if (request.path.includes("/pulls/101/reviews") && request.method === "GET")
        response.end(JSON.stringify([review]));
      else if (request.path.endsWith("/dismissals")) response.end('{"state":"DISMISSED"}');
      else response.end("[]");
    });
    const result = await runWithGithubTransport("rest", () =>
      applyRestReviewChunk({
        ...empty,
        dismissIds: ["PRR_opaque", "PRR_missing"],
      }),
    );
    expect(result.data.d0).toEqual({ pullRequestReview: { state: "DISMISSED" } });
    expect(result.errors).toEqual([
      {
        message: expect.stringContaining("Cannot address review PRR_missing through REST"),
        path: ["d1"],
      },
    ]);
    expect(wire.requests.filter((request) => request.path.endsWith("/dismissals"))).toEqual([
      expect.objectContaining({ path: `${prefix}/pulls/101/reviews/77/dismissals` }),
    ]);
  });

  it("returns the authoritative REST reply comment ID", async () => {
    await serve((request, response) => {
      if (request.path === "/user") response.end('{"login":"agent"}');
      else if (request.method === "POST") response.end('{"id":123}');
      else response.end("[]");
    });
    const result = await runWithGithubTransport("rest", () =>
      applyRestReviewChunk({ ...empty, replyIds: ["rest-thread-11"] }),
    );
    expect(result.data.p0).toEqual({ comment: { id: "123" } });
    expect(result.errors).toEqual([]);
    expect(wire.requests.filter((request) => request.method === "POST")).toEqual([
      expect.objectContaining({ path: `${prefix}/pulls/101/comments/11/replies` }),
    ]);
  });

  it("marks a denied dismissal against the matching review body after resolving its REST identity", async () => {
    await recordRestIdentity(repo, 101, "77", 77, "review");
    await serve((request, response) => {
      if (request.method === "PUT") {
        response.statusCode = 403;
        response.end('{"message":"Resource not accessible by integration"}');
      } else if (request.path.includes("/pulls/101/reviews"))
        response.end(JSON.stringify([review]));
      else response.end("[]");
    });
    const result = await runWithGithubTransport("rest", () =>
      applyRestReviewChunk({
        ...empty,
        repo: undefined,
        pr: undefined,
        dismissIds: ["77"],
      }),
    );
    expect(result.errors[0]?.message).toContain("403");
    const seen = await loadSeenMap({ owner: repo.owner, repo: repo.name, pr: 101 });
    expect(mutationWasDenied("77", review.body, seen)).toBe(true);
  });

  it("surfaces unsupported resolution outside CCR and refuses unconfirmed CCR mutation results", async () => {
    await serve((request, response) => {
      if (request.path.endsWith("/resolve")) response.end('{"resolved":false}');
      else if (request.path.endsWith("/dismissals")) response.end('{"state":"APPROVED"}');
      else response.end("[]");
    });
    const unsupported = await runWithGithubTransport("rest", () =>
      applyRestReviewChunk({ ...empty, resolveIds: ["rest-thread-11"] }),
    );
    expect(unsupported.errors[0]?.message).toContain(
      "thread resolution requires the cloud CCR proxy",
    );
    expect(wire.requests).toEqual([]);

    process.env["CLAUDE_CODE_REMOTE"] = "true";
    const unconfirmed = await runWithGithubTransport("rest", () =>
      applyRestReviewChunk({
        ...empty,
        resolveIds: ["rest-thread-11"],
        dismissIds: ["77"],
      }),
    );
    expect(unconfirmed.errors.map(({ message }) => message)).toEqual([
      "CCR resolve did not confirm the thread was resolved",
      "Review dismissal did not confirm DISMISSED state",
    ]);
  });
});
