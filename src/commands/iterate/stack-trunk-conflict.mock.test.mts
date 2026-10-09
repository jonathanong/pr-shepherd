import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubRequestError } from "../../github/errors.mts";

const { mockGraphql, mockGraphqlWithRateLimit } = vi.hoisted(() => ({
  mockGraphql: vi.fn(),
  mockGraphqlWithRateLimit: vi.fn(),
}));
vi.mock("../../github/client.mts", () => ({
  graphql: mockGraphql,
  graphqlWithRateLimit: mockGraphqlWithRateLimit,
}));

import { lookupUpperLayerTrunkConflict } from "./stack-trunk-conflict.mts";

const input = {
  owner: "acme",
  name: "widgets",
  pr: 2548,
  headRef: "a".repeat(40),
  trunk: "main",
};
const knownBottom = { ...input, bottomPr: 2547 };

function compare(behindBy: number | null) {
  return {
    data: {
      repository: {
        pullRequest: {
          baseRef: behindBy === null ? null : { compare: { behindBy } },
        },
      },
    },
  };
}

// Two merged trunk-based layers followed by four open descendants. The lowest open PR
// retains its merged parent's base rather than having been retargeted onto main.
const members = [2536, 2546, 2547, 2548, 2549, 2550].map((number, index) => ({
  position: index + 1,
  pullRequest: {
    number,
    state: index < 2 ? "MERGED" : "OPEN",
    headRefName: `layer-${number}`,
    headRefOid: `head-${number}`,
    baseRefName: index < 2 ? "main" : `layer-${index === 2 ? 2546 : number - 1}`,
    baseRefOid: `base-${number}`,
  },
}));

function topologyPage(
  nodes: typeof members,
  pageInfo = { hasNextPage: false, endCursor: null as string | null },
) {
  return {
    data: {
      repository: {
        viewerCanAdminister: false,
        pullRequest: {
          stack: {
            id: "stack-id",
            number: 2535,
            size: 6,
            baseRefName: "main",
            entries: { nodes, pageInfo },
          },
        },
      },
    },
  };
}

function paginatedTopology() {
  mockGraphqlWithRateLimit
    .mockResolvedValueOnce(
      topologyPage(members.slice(0, 2), { hasNextPage: true, endCursor: "next" }),
    )
    .mockResolvedValueOnce(topologyPage(members.slice(2).reverse()));
}

describe("lookupUpperLayerTrunkConflict", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockGraphql.mockReset();
    mockGraphqlWithRateLimit.mockReset();
  });

  it("uses a known bottom open layer without refetching topology", async () => {
    mockGraphql.mockResolvedValue(compare(0));
    await expect(lookupUpperLayerTrunkConflict(knownBottom)).resolves.toEqual({
      trunk: "main",
      bottomPr: 2547,
    });
    expect(mockGraphqlWithRateLimit).not.toHaveBeenCalled();
  });

  it("rebases the known bottom onto trunk without comparing its obsolete parent", async () => {
    // A positive comparison to the merged parent's branch must never override topology.
    mockGraphql.mockResolvedValue(compare(3));
    await expect(lookupUpperLayerTrunkConflict({ ...knownBottom, pr: 2547 })).resolves.toEqual({
      trunk: "main",
      bottomPr: 2547,
    });
    expect(mockGraphql).not.toHaveBeenCalled();
    expect(mockGraphqlWithRateLimit).not.toHaveBeenCalled();
  });

  it("finds the bottom open layer across validated pages regardless of its base", async () => {
    paginatedTopology();
    mockGraphql.mockResolvedValue(compare(0));
    await expect(lookupUpperLayerTrunkConflict(input)).resolves.toEqual({
      trunk: "main",
      bottomPr: 2547,
    });
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(2);
    expect(mockGraphqlWithRateLimit.mock.calls[1]?.[1]).toMatchObject({ after: "next" });
  });

  it("finds a bottom retaining a merged base before checking whether it is behind that parent", async () => {
    paginatedTopology();
    mockGraphql.mockResolvedValue(compare(3));
    await expect(lookupUpperLayerTrunkConflict({ ...input, pr: 2547 })).resolves.toEqual({
      trunk: "main",
      bottomPr: 2547,
    });
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it("keeps the parent rebase when a true upper layer is behind its base", async () => {
    mockGraphql.mockResolvedValue(compare(3));
    await expect(lookupUpperLayerTrunkConflict(knownBottom)).resolves.toBeUndefined();
    expect(mockGraphqlWithRateLimit).not.toHaveBeenCalled();
  });

  it.each(["CLOSED", "UNKNOWN"])(
    "keeps the parent route after a %s predecessor even if an open descendant contains its base",
    async (state) => {
      const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const unresolvedMembers = members.map((member) => ({
        ...member,
        pullRequest: {
          ...member.pullRequest,
          ...(member.pullRequest.number === 2546 && { state }),
        },
      }));
      mockGraphqlWithRateLimit.mockResolvedValue(topologyPage(unresolvedMembers));
      mockGraphql.mockResolvedValue(compare(0));

      await expect(lookupUpperLayerTrunkConflict(input)).resolves.toBeUndefined();
      await expect(lookupUpperLayerTrunkConflict({ ...input, pr: 2547 })).resolves.toBeUndefined();
      expect(mockGraphql).not.toHaveBeenCalled();
      expect(write).toHaveBeenCalledWith(
        expect.stringContaining(`PR #2546 in state ${state} before open PR #2547`),
      );
    },
  );

  it("rethrows a comparison rate-limit error", async () => {
    mockGraphql.mockRejectedValue(
      new GitHubRequestError("API rate limit exceeded", { status: 429 }),
    );
    await expect(lookupUpperLayerTrunkConflict(knownBottom)).rejects.toBeInstanceOf(
      GitHubRequestError,
    );
  });

  it("rethrows a topology rate-limit error", async () => {
    mockGraphqlWithRateLimit.mockRejectedValue(
      new GitHubRequestError("API rate limit exceeded", { status: 429 }),
    );
    await expect(lookupUpperLayerTrunkConflict(input)).rejects.toBeInstanceOf(GitHubRequestError);
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it("ignores other comparison failures", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockGraphql.mockRejectedValueOnce(new GitHubRequestError("bad gateway", { status: 502 }));
    await expect(lookupUpperLayerTrunkConflict(knownBottom)).resolves.toBeUndefined();
    mockGraphql.mockRejectedValueOnce("socket hangup");
    await expect(lookupUpperLayerTrunkConflict(knownBottom)).resolves.toBeUndefined();
    mockGraphql.mockResolvedValueOnce({ data: { repository: null } });
    await expect(lookupUpperLayerTrunkConflict(knownBottom)).resolves.toBeUndefined();
    mockGraphql.mockResolvedValueOnce(compare(null));
    await expect(lookupUpperLayerTrunkConflict(knownBottom)).resolves.toBeUndefined();
    expect(write.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining("bad gateway"),
      expect.stringContaining("socket hangup"),
      expect.stringContaining("pull request not found"),
      expect.stringContaining("base comparison unavailable"),
    ]);
  });

  it("does not select a bottom from incomplete topology but retains a proven trunk conflict", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockGraphqlWithRateLimit.mockResolvedValueOnce(topologyPage(members.slice(2)));
    mockGraphql.mockResolvedValue(compare(0));
    await expect(lookupUpperLayerTrunkConflict(input)).resolves.toEqual({ trunk: "main" });
    expect(write).toHaveBeenCalledWith(expect.stringContaining("incomplete stack membership"));
  });
});
