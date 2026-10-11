import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));
vi.mock("./stack-read.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stack-read.mts")>()),
  readStackTopology: vi.fn(),
}));

import { graphqlWithRateLimit } from "./client.mts";
import { loadBaseBehindBy, loadMergeTargetStatus } from "./merge-target-rules.mts";
import { readStackTopology } from "./stack-read.mts";

const graphql = vi.mocked(graphqlWithRateLimit);
const topology = vi.mocked(readStackTopology);

const input = {
  owner: "acme",
  name: "widgets",
  pr: 622,
  baseRefName: "feature-parent",
  headRefName: "feature",
  localContexts: ["local"],
  stack: { baseRefName: "main" },
};

describe("loadMergeTargetStatus", () => {
  beforeEach(() => {
    graphql.mockReset();
    topology.mockReset();
  });

  it.each([2547, 2569, 2627, 2629])(
    "loads trunk rules for PR #%i while the lowest open layer retains its merged parent's base",
    async (pr) => {
      const members = [
        [2509, "MERGED", "main", "hashtags"],
        [2534, "MERGED", "main", "hostname-flags"],
        [2547, "OPEN", "hostname-flags", "dispatcher"],
        [2569, "OPEN", "dispatcher", "bloom"],
        [2627, "OPEN", "bloom", "registry"],
        [2629, "OPEN", "registry", "projection"],
      ] as const;
      topology.mockResolvedValue({
        ordered: members.map(([number, state, baseRefName, headRefName]) => ({
          number,
          state,
          baseRefName,
          headRefName,
          headRefOid: `${number}`.padStart(40, "0"),
          baseRefOid: "a".repeat(40),
        })),
      } as Awaited<ReturnType<typeof readStackTopology>>);
      graphql.mockResolvedValue({
        data: {
          repository: {
            ref: {
              branchProtectionRule: {
                requiresStatusChecks: true,
                requiredStatusCheckContexts: ["required-on-main"],
              },
              compare: { behindBy: 13 },
            },
          },
        },
      } as Awaited<ReturnType<typeof graphqlWithRateLimit>>);

      const status = await loadMergeTargetStatus({ ...input, pr });
      expect({ ...status, trunkBehindBy: await status.trunkBehindBy?.() }).toEqual({
        contexts: ["required-on-main"],
        trunkBehindBy: 13,
        stackBottomPr: 2547,
      });
      expect(graphql).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          qualifiedName: "refs/heads/main",
          headRef: "2547".padStart(40, "0"),
        }),
      );
    },
  );

  it("fails when the stack has no open layer", async () => {
    topology.mockResolvedValue({
      ordered: [
        {
          number: 1,
          state: "CLOSED",
          baseRefName: "main",
          headRefName: "old",
          headRefOid: "a",
          baseRefOid: "b",
        },
      ],
    } as Awaited<ReturnType<typeof readStackTopology>>);

    await expect(loadMergeTargetStatus(input)).rejects.toThrow(
      "Native stack for PR #622 has no open layer",
    );
    expect(graphql).not.toHaveBeenCalled();
  });

  it.each(["CLOSED", "UNKNOWN"])(
    "does not designate an open descendant as bottom after a %s predecessor",
    async (state) => {
      topology.mockResolvedValue({
        ordered: [
          { number: 610, state: "MERGED" },
          { number: 611, state },
          { number: 622, state: "OPEN", headRefOid: "c".repeat(40) },
          { number: 623, state: "OPEN", headRefOid: "d".repeat(40) },
        ],
      } as Awaited<ReturnType<typeof readStackTopology>>);

      await expect(loadMergeTargetStatus(input)).rejects.toThrow(
        `PR #611 in state ${state} before open PR #622`,
      );
      expect(graphql).not.toHaveBeenCalled();
    },
  );

  it("fails when the trunk ref does not exist", async () => {
    graphql.mockResolvedValue({
      data: { repository: { ref: null } },
    } as Awaited<ReturnType<typeof graphqlWithRateLimit>>);

    await expect(
      loadMergeTargetStatus({ ...input, baseRefName: "main", stack: { baseRefName: "main" } }),
    ).rejects.toThrow("Branch refs/heads/main was not found in acme/widgets");
  });
});

describe("loadBaseBehindBy", () => {
  beforeEach(() => graphql.mockReset());

  it("returns the base compare behind count", async () => {
    graphql.mockResolvedValue({
      data: { repository: { ref: { compare: { behindBy: 93 } } } },
    } as Awaited<ReturnType<typeof graphqlWithRateLimit>>);

    const head = "c".repeat(40);
    await expect(loadBaseBehindBy("acme", "widgets", "main", head)).resolves.toBe(93);
    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining("behindBy"),
      expect.objectContaining({
        qualifiedName: "refs/heads/main",
        headRef: "c".repeat(40),
      }),
    );
  });

  it("returns zero when GitHub has no compare object", async () => {
    graphql.mockResolvedValue({
      data: { repository: { ref: { compare: null } } },
    } as Awaited<ReturnType<typeof graphqlWithRateLimit>>);
    await expect(loadBaseBehindBy("acme", "widgets", "main", "feature")).resolves.toBe(0);
  });

  it("fails when the repository or base ref is missing", async () => {
    graphql.mockResolvedValue({
      data: { repository: null },
    } as Awaited<ReturnType<typeof graphqlWithRateLimit>>);
    await expect(loadBaseBehindBy("acme", "widgets", "main", "feature")).rejects.toThrow(
      "acme/widgets",
    );
    graphql.mockResolvedValue({
      data: { repository: { ref: null } },
    } as Awaited<ReturnType<typeof graphqlWithRateLimit>>);
    await expect(loadBaseBehindBy("acme", "widgets", "main", "feature")).rejects.toThrow(
      "refs/heads/main",
    );
  });
});
