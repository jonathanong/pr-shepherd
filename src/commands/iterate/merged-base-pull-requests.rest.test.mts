import { describe, expect, it } from "vitest";
import { serve, wire, prefix, pull } from "../../../test-helpers/github/rest-read.test-support.mts";
import { lookupMergedBasePullRequests } from "./merged-base-pull-requests.mts";
import { readRestMergedBasePullRequests } from "../../github/rest-merged-base-read.mts";
import { runWithGithubTransport } from "../../github/transport.mts";

const input = {
  owner: "octocat",
  repo: "hello-world",
  baseRefName: "feature/parent",
  baseRefOid: "aaa111",
};
const candidate = (number: number) => ({
  ...pull,
  number,
  html_url: `https://github.com/octocat/hello-world/pull/${number}`,
  state: "closed",
  merged_at: "2026-10-09T00:00:00Z",
  head: { ...pull.head, ref: input.baseRefName },
});
const firstPath = `${prefix}/pulls?state=closed&head=octocat%3Afeature%2Fparent&sort=updated&direction=desc&per_page=100`;

describe("REST merged-base PR lookup", () => {
  it("pages every closed candidate and requires actual merged state, head SHA, branch and repository", async () => {
    await serve((request, response) => {
      const url = new URL(request.path, "https://api.github.com");
      if (url.searchParams.get("page") === "2") {
        response.end(
          JSON.stringify([{ ...candidate(101), base: { ...pull.base, ref: "release" } }]),
        );
        return;
      }
      response.setHeader("link", `<https://api.github.com${firstPath}&page=2>; rel="next"`);
      const candidates = Array.from({ length: 100 }, (_, index) => ({
        ...candidate(index + 1),
        head: { ...candidate(index + 1).head, sha: "another-head" },
      }));
      candidates[0] = candidate(1);
      candidates[2] = {
        ...candidate(3),
        head: { ...candidate(3).head, repo: { full_name: "fork/hello-world" } },
      };
      candidates[3] = {
        ...candidate(4),
        head: { ...candidate(4).head, ref: "other-branch" },
      };
      response.end(
        JSON.stringify([
          ...candidates.slice(0, 4),
          { ...candidate(5), merged_at: null },
          { ...candidate(6), head: { ...candidate(6).head, repo: null } },
          ...candidates.slice(6),
        ]),
      );
    });
    const result = await runWithGithubTransport("rest", () => lookupMergedBasePullRequests(input));
    expect(result).toEqual([
      {
        number: 1,
        url: candidate(1).html_url,
        state: "MERGED",
        headRefName: input.baseRefName,
        headRefOid: input.baseRefOid,
        baseRefName: "main",
        mergedAt: candidate(1).merged_at,
        headRepository: { nameWithOwner: "octocat/hello-world" },
      },
      expect.objectContaining({ number: 101, baseRefName: "release" }),
    ]);
    expect(wire.requests.map((request) => request.path)).toEqual([
      firstPath,
      `${firstPath}&page=2`,
    ]);
  });

  it("switches the named lookup after a GraphQL cloud refusal instead of swallowing it", async () => {
    await serve((request, response) => {
      if (request.path === "/graphql") {
        response.statusCode = 403;
        response.end('{"message":"GitHub GraphQL is not available from Claude Code sessions"}');
      } else response.end(JSON.stringify([candidate(7)]));
    });
    expect(
      await runWithGithubTransport("auto", () => lookupMergedBasePullRequests(input)),
    ).toMatchObject([{ number: 7, headRefOid: input.baseRefOid, state: "MERGED" }]);
    expect(wire.requests.map((request) => request.path)).toEqual(["/graphql", firstPath]);
  });

  it("propagates an eligible REST server failure instead of ignoring incomplete context", async () => {
    await serve((_request, response) => {
      response.statusCode = 503;
      response.end('{"message":"Unavailable"}');
    });
    await expect(
      runWithGithubTransport("rest", () => lookupMergedBasePullRequests(input)),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("rejects a merged candidate with missing head evidence instead of guessing a match", async () => {
    await serve((_request, response) =>
      response.end(JSON.stringify([{ ...candidate(7), head: { ref: input.baseRefName } }])),
    );
    await expect(readRestMergedBasePullRequests(input)).rejects.toThrow("closed pull head SHA");
  });
});
