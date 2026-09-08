import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));

import { graphqlWithRateLimit } from "./client.mts";
import { fetchPollSummary } from "./poll-summary.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const repo = { owner: "acme", name: "widgets" };

function stack(overrides: Record<string, unknown> = {}) {
  return {
    id: "STACK",
    number: 7,
    size: 1,
    baseRefName: "main",
    entries: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [{ position: 1, pullRequest: { number: 42 } }],
    },
    ...overrides,
  };
}

function response(value: unknown) {
  return { data: { repository: { pullRequest: { stack: value } } } };
}

beforeEach(() => vi.clearAllMocks());

describe("poll summary fail-closed reads", () => {
  it("rejects an empty explicit selection", async () => {
    await expect(fetchPollSummary({}, repo)).rejects.toThrow("requires at least two PRs");
  });

  it("rejects a missing repository and missing explicit PR", async () => {
    mockGraphql.mockResolvedValueOnce({ data: { repository: null } });
    await expect(fetchPollSummary({ prNumbers: [42] }, repo)).rejects.toThrow(
      "not found or access denied",
    );

    mockGraphql.mockResolvedValueOnce({ data: { repository: { pr0: null } } });
    await expect(fetchPollSummary({ prNumbers: [42] }, repo)).rejects.toThrow("PR #42 not found");
  });

  it.each([
    [{ data: { repository: null } }, "not found or access denied"],
    [{ data: { repository: { pullRequest: null } } }, "PR #42 not found"],
    [response(null), "not part of a native GitHub stack"],
    [
      response(
        stack({
          entries: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [{ position: 1, pullRequest: null }],
          },
        }),
      ),
      "incomplete pull-request stack entry",
    ],
    [
      response(
        stack({
          entries: {
            pageInfo: { hasNextPage: true, endCursor: null },
            nodes: [{ position: 1, pullRequest: { number: 42 } }],
          },
        }),
      ),
      "did not include an end cursor",
    ],
    [response(stack({ size: 2 })), "incomplete stack membership"],
  ])("rejects incomplete stack response %#", async (value, message) => {
    mockGraphql.mockResolvedValue(value);
    await expect(fetchPollSummary({ stackPrNumber: 42 }, repo)).rejects.toThrow(message);
  });

  it("rejects stack identity changes between pages", async () => {
    mockGraphql
      .mockResolvedValueOnce(
        response(
          stack({
            size: 2,
            entries: {
              pageInfo: { hasNextPage: true, endCursor: "next" },
              nodes: [{ position: 1, pullRequest: { number: 42 } }],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(response(stack({ id: "OTHER", size: 2 })));

    await expect(fetchPollSummary({ stackPrNumber: 42 }, repo)).rejects.toThrow(
      "membership changed",
    );
  });
});
