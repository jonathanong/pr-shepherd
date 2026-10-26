import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));
vi.mock("./stack-size-hint.mts", () => ({
  loadStackSizeHint: vi.fn(async () => 0),
  storeStackSizeHint: vi.fn(async () => {}),
}));
vi.mock("./poll-summary-check-hydration.mts", () => ({ hydratePollSummaryChecks: vi.fn() }));
vi.mock("../state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/seen-comments.mts")>();
  return { ...actual, loadSeenMap: vi.fn() };
});

import { graphqlWithRateLimit } from "./client.mts";
import { GitHubRequestError } from "./errors.mts";
import { hydratePollSummaryChecks } from "./poll-summary-check-hydration.mts";
import { fetchPollSummary, fetchRawSummaryPr } from "./poll-summary.mts";
import { runWithGithubTransport } from "./transport.mts";
import { explicit, rawPr } from "../../test-helpers/github/poll-summary-row-raw.mts";
import { loadSeenMap } from "../state/seen-comments.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const mockHydrate = vi.mocked(hydratePollSummaryChecks);
const mockSeen = vi.mocked(loadSeenMap);
const repo = { owner: "acme", name: "widgets" };
/** The summary read of `failing` rejects with `error`; every other PR reads normally. */
function failSummaryOf(failing: number[], error: unknown) {
  mockSeen.mockImplementation(async ({ pr }) => {
    if (failing.includes(pr)) throw error;
    return new Map();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHydrate.mockResolvedValue(undefined);
  mockSeen.mockResolvedValue(new Map());
});

describe("failures that still reject the tick", () => {
  it.each([
    [
      "secondary rate limit",
      new GitHubRequestError("slow down", { status: 403, retryAfterSeconds: 5 }),
    ],
    [
      "primary rate limit",
      new GitHubRequestError("exhausted", {
        status: 200,
        rateLimit: { limit: 5000, remaining: 0, resetAt: 1, resource: "graphql" },
      }),
    ],
    ["bad credentials", new GitHubRequestError("Bad credentials", { status: 401 })],
  ])("still fails the whole tick on a %s", async (_name, error) => {
    mockGraphql.mockResolvedValue(explicit([42, 43]));
    failSummaryOf([43], error);

    await expect(fetchPollSummary({ prNumbers: [42, 43] }, repo)).rejects.toBe(error);
  });

  it("leaves a transport-fallback error to the transport layer instead of a row", async () => {
    const error = new GitHubRequestError("boom", { status: 502 });
    mockGraphql.mockResolvedValue(explicit([42, 43]));
    failSummaryOf([43], error);

    await expect(
      runWithGithubTransport("graphql", () => fetchPollSummary({ prNumbers: [42, 43] }, repo)),
    ).rejects.toBe(error);
  });

  it("still fails the whole tick on a fatal hydration error", async () => {
    const error = new GitHubRequestError("Bad credentials", { status: 401 });
    mockGraphql.mockResolvedValue(explicit([42, 43]));
    mockHydrate.mockRejectedValueOnce(error);

    await expect(fetchPollSummary({ prNumbers: [42, 43] }, repo)).rejects.toBe(error);
  });

  it("rethrows the first error when every row failed", async () => {
    mockGraphql.mockResolvedValue(explicit([42, 43]));
    mockSeen.mockRejectedValueOnce(new Error("first")).mockRejectedValueOnce(new Error("second"));

    await expect(fetchPollSummary({ prNumbers: [42, 43] }, repo)).rejects.toThrow("first");
  });

  it("rethrows a lone failing PR", async () => {
    mockGraphql.mockResolvedValue(explicit([42]));
    failSummaryOf([42], new Error("only one"));

    await expect(fetchPollSummary({ prNumbers: [42] }, repo)).rejects.toThrow("only one");
  });

  it("surfaces a hydration failure from the raw one-PR read", async () => {
    mockGraphql.mockResolvedValue(explicit([42]));
    mockHydrate.mockRejectedValueOnce(new Error("hydrate failed"));

    await expect(fetchRawSummaryPr(42, repo)).rejects.toThrow("hydrate failed");
  });
});

describe("stack selections stay fail-closed", () => {
  it("rejects the whole stack when one layer's summary read fails", async () => {
    const entry = (number: number, position: number) => ({
      position,
      pullRequest: rawPr(number),
    });
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          viewerCanAdminister: false,
          pullRequest: {
            stack: {
              id: "STACK",
              number: 7,
              size: 2,
              baseRefName: "main",
              entries: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [entry(43, 1), entry(44, 2)],
              },
            },
          },
        },
      },
    });
    failSummaryOf([44], new Error("layer unreadable"));

    await expect(fetchPollSummary({ stackPrNumber: 44 }, repo)).rejects.toThrow("layer unreadable");
  });
});
