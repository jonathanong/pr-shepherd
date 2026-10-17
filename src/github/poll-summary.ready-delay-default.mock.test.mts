import { describe, expect, it, vi } from "vitest";

// The v1 built-in config: no ready delay.
vi.mock("../config/load.mts", async (importOriginal) => {
  const { testConfig } = await import("../../test-helpers/config/test-config.mts");
  const config = testConfig();
  return {
    ...(await importOriginal<typeof import("../config/load.mts")>()),
    loadConfig: () => config,
  };
});
vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));
vi.mock("../state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/seen-comments.mts")>();
  return { ...actual, loadSeenMap: vi.fn().mockResolvedValue(new Map()) };
});

import { graphqlWithRateLimit } from "./client.mts";
import { fetchPollSummary } from "./poll-summary.mts";

const empty = { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] };

describe("fetchPollSummary — default ready delay", () => {
  it("skips the ready-delay countdown when the configured delay is 0", async () => {
    vi.mocked(graphqlWithRateLimit).mockResolvedValue({
      data: {
        repository: {
          viewerPermission: "WRITE",
          pr0: {
            number: 43,
            title: "PR 43",
            url: "https://github.com/acme/widgets/pull/43",
            state: "OPEN",
            isDraft: false,
            viewerCanUpdate: true,
            headRefName: "feature-43",
            headRefOid: "4".repeat(40),
            baseRefName: "main",
            baseRefOid: "main-sha",
            mergeable: "MERGEABLE",
            mergeStateStatus: "CLEAN",
            reviewDecision: null,
            isInMergeQueue: false,
            stack: null,
            stackEntry: null,
            comments: empty,
            reviews: empty,
            reviewThreads: empty,
            commits: {
              nodes: [
                {
                  commit: {
                    statusCheckRollup: {
                      state: "SUCCESS",
                      contexts: {
                        totalCount: 1,
                        pageInfo: { hasPreviousPage: false },
                        nodes: [
                          { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    });
    const result = await fetchPollSummary({ prNumbers: [43] }, { owner: "acme", name: "widgets" });
    expect(result.prs[0]?.reasons).not.toContain("ready-delay");
    expect(result.prs[0]).not.toHaveProperty("remainingSeconds");
    expect(result.prs[0]?.action).not.toBe("wait");
  });
});
