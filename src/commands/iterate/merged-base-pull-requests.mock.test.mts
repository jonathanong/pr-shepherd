import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubRequestError } from "../../github/errors.mts";

const { mockGraphql } = vi.hoisted(() => ({ mockGraphql: vi.fn() }));
vi.mock("../../github/client.mts", () => ({ graphql: mockGraphql }));

import { lookupMergedBasePullRequests } from "./merged-base-pull-requests.mts";

const input = {
  owner: "owner",
  repo: "repo",
  baseRefName: "parent",
  baseRefOid: "a".repeat(40),
};
const parent = {
  number: 7,
  url: "https://github.com/owner/repo/pull/7",
  state: "MERGED",
  headRefName: "parent",
  headRefOid: input.baseRefOid,
  baseRefName: "main",
  mergedAt: "2026-10-07T04:44:56Z",
  headRepository: { nameWithOwner: "owner/repo" },
};

describe("lookupMergedBasePullRequests", () => {
  afterEach(() => mockGraphql.mockReset());

  it("returns every exact merged-base match and ignores reused names and forks", async () => {
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          pullRequests: {
            nodes: [
              parent,
              { ...parent, number: 8, headRefOid: "b".repeat(40) },
              { ...parent, number: 9, headRepository: { nameWithOwner: "fork/repo" } },
              { ...parent, number: 10, headRefName: "other" },
              { ...parent, number: 11, state: "OPEN" },
              { ...parent, number: 12, baseRefName: "release" },
              null,
            ],
          },
        },
      },
    });
    await expect(lookupMergedBasePullRequests(input)).resolves.toEqual([
      parent,
      { ...parent, number: 12, baseRefName: "release" },
    ]);
    expect(mockGraphql).toHaveBeenCalledWith(expect.any(String), {
      owner: "owner",
      repo: "repo",
      branch: "parent",
    });
    expect(mockGraphql.mock.calls[0]?.[0]).toContain("first: 20");
    expect(mockGraphql.mock.calls[0]?.[0]).toContain("field: UPDATED_AT, direction: DESC");
  });

  it("rethrows rate limits and ignores other query failures", async () => {
    mockGraphql.mockRejectedValueOnce(new GitHubRequestError("rate limit", { status: 429 }));
    await expect(lookupMergedBasePullRequests(input)).rejects.toBeInstanceOf(GitHubRequestError);
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockGraphql.mockRejectedValueOnce(new Error("unavailable"));
    await expect(lookupMergedBasePullRequests(input)).resolves.toEqual([]);
    expect(write).toHaveBeenCalledWith(expect.stringContaining("unavailable"));
    write.mockRestore();
  });

  it("returns no candidates when the repository or candidate repository is unavailable", async () => {
    mockGraphql.mockResolvedValueOnce({ data: { repository: null } });
    await expect(lookupMergedBasePullRequests(input)).resolves.toEqual([]);
    mockGraphql.mockResolvedValueOnce({
      data: { repository: { pullRequests: { nodes: [{ ...parent, headRepository: null }] } } },
    });
    await expect(lookupMergedBasePullRequests(input)).resolves.toEqual([]);
  });
});
