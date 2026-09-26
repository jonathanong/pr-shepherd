import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubRequestError } from "../../github/errors.mts";

const { mockGraphql } = vi.hoisted(() => ({ mockGraphql: vi.fn() }));
vi.mock("../../github/client.mts", () => ({ graphql: mockGraphql }));

import { lookupUpperLayerTrunkConflict } from "./stack-trunk-conflict.mts";

const input = {
  owner: "acme",
  name: "widgets",
  pr: 12,
  headRef: "a".repeat(40),
  trunk: "main",
};

function compare(behindBy: number | null, entries?: unknown) {
  return {
    data: {
      repository: {
        pullRequest: {
          baseRef: behindBy === null ? null : { compare: { behindBy } },
          stack: entries ?? null,
        },
      },
    },
  };
}

describe("lookupUpperLayerTrunkConflict", () => {
  afterEach(() => {
    mockGraphql.mockReset();
  });

  it("returns the bottom open layer when the head already contains its base", async () => {
    mockGraphql.mockResolvedValue(
      compare(0, {
        entries: {
          pageInfo: { hasNextPage: false },
          nodes: [
            { position: 5, pullRequest: { number: 15, state: "OPEN", baseRefName: "main" } },
            { position: 1, pullRequest: { number: 11, state: "MERGED", baseRefName: "main" } },
            null,
            { position: 2, pullRequest: { number: 12, state: "OPEN", baseRefName: "feature-a" } },
            { position: 4, pullRequest: null },
            { position: 3, pullRequest: { number: 13, state: "OPEN", baseRefName: "main" } },
          ],
        },
      }),
    );
    await expect(lookupUpperLayerTrunkConflict(input)).resolves.toEqual({
      trunk: "main",
      bottomPr: 13,
    });
  });

  it("keeps the parent rebase when the layer is behind its base", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockGraphql.mockResolvedValue(
      compare(3, { entries: { pageInfo: { hasNextPage: false }, nodes: [] } }),
    );
    await expect(lookupUpperLayerTrunkConflict(input)).resolves.toBeUndefined();
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it("rethrows a rate-limit error", async () => {
    mockGraphql.mockRejectedValue(
      new GitHubRequestError("API rate limit exceeded", { status: 429 }),
    );
    await expect(lookupUpperLayerTrunkConflict(input)).rejects.toBeInstanceOf(GitHubRequestError);
  });

  it("ignores other lookup failures", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockGraphql.mockRejectedValueOnce(new GitHubRequestError("bad gateway", { status: 502 }));
    await expect(lookupUpperLayerTrunkConflict(input)).resolves.toBeUndefined();
    mockGraphql.mockRejectedValueOnce("socket hangup");
    await expect(lookupUpperLayerTrunkConflict(input)).resolves.toBeUndefined();
    mockGraphql.mockResolvedValueOnce({ data: { repository: null } });
    await expect(lookupUpperLayerTrunkConflict(input)).resolves.toBeUndefined();
    mockGraphql.mockResolvedValueOnce(compare(null));
    await expect(lookupUpperLayerTrunkConflict(input)).resolves.toBeUndefined();
    expect(write.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining("bad gateway"),
      expect.stringContaining("socket hangup"),
      expect.stringContaining("pull request not found"),
      expect.stringContaining("base comparison unavailable"),
    ]);
    write.mockRestore();
  });

  it("still reports a trunk conflict when the bottom layer is not on the page", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockGraphql.mockResolvedValueOnce(
      compare(0, {
        entries: {
          pageInfo: { hasNextPage: true },
          nodes: [
            { position: 2, pullRequest: { number: 12, state: "OPEN", baseRefName: "feature-a" } },
          ],
        },
      }),
    );
    await expect(lookupUpperLayerTrunkConflict(input)).resolves.toEqual({ trunk: "main" });
    mockGraphql.mockResolvedValueOnce(
      compare(0, {
        entries: {
          pageInfo: { hasNextPage: false },
          nodes: [
            { position: 2, pullRequest: { number: 12, state: "OPEN", baseRefName: "feature-a" } },
          ],
        },
      }),
    );
    await expect(lookupUpperLayerTrunkConflict(input)).resolves.toEqual({ trunk: "main" });
    mockGraphql.mockResolvedValueOnce(compare(0));
    await expect(lookupUpperLayerTrunkConflict(input)).resolves.toEqual({ trunk: "main" });
    const lines = write.mock.calls.map((call) => String(call[0]));
    expect(lines[0]).toContain("truncated");
    expect(lines[1]).toContain("bottom open layer not found");
    expect(lines[2]).toContain("bottom open layer not found");
    write.mockRestore();
  });
});
