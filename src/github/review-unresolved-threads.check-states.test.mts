import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({
  graphqlWithRateLimit: vi.fn(),
}));
vi.mock("./rest-feedback-read.mts", () => ({
  readRestFeedback: vi.fn(),
}));
vi.mock("./rest-identities.mts", () => ({
  resolveGraphqlThreadId: vi.fn((id: string) => Promise.resolve(id)),
  resolveRestIdentity: vi.fn(),
}));

import { graphqlWithRateLimit } from "./client.mts";
import { readRestFeedback } from "./rest-feedback-read.mts";
import { resolveGraphqlThreadId, resolveRestIdentity } from "./rest-identities.mts";
import { runWithGithubTransport } from "./transport.mts";
import { checkThreadsStillUnresolved } from "./review-unresolved-threads.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const mockReadRestFeedback = vi.mocked(readRestFeedback);
const mockResolveGraphqlThreadId = vi.mocked(resolveGraphqlThreadId);
const mockResolveRestIdentity = vi.mocked(resolveRestIdentity);
const REPO = { owner: "owner", name: "repo" };

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveGraphqlThreadId.mockImplementation((id: string) => Promise.resolve(id));
});

describe("checkThreadsStillUnresolved", () => {
  it("queries only the given thread node IDs and treats non-confirmed threads as unresolved", async () => {
    mockGraphql.mockResolvedValueOnce({
      data: {
        nodes: [{ id: "PRRT_1", isResolved: false }, { id: "PRRT_2", isResolved: true }, null],
      },
    });

    const still = await checkThreadsStillUnresolved(42, REPO, ["PRRT_1", "PRRT_2", "PRRT_NULL"]);
    expect([...still]).toEqual(["PRRT_1", "PRRT_NULL"]);
    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(mockGraphql).toHaveBeenCalledWith(expect.any(String), {
      ids: ["PRRT_1", "PRRT_2", "PRRT_NULL"],
    });
  });

  it("translates cached rest-thread IDs to GraphQL IDs and keeps unmapped REST IDs unresolved", async () => {
    mockResolveGraphqlThreadId.mockImplementation((id: string) => {
      if (id === "rest-thread-10") return Promise.resolve("PRRT_10");
      if (id === "rest-thread-11") return Promise.resolve("PRRT_11");
      return Promise.reject(new Error(`No GraphQL thread identity for ${id}`));
    });
    mockGraphql.mockResolvedValueOnce({
      data: {
        nodes: [
          { id: "PRRT_10", isResolved: true },
          { id: "PRRT_11", isResolved: false },
        ],
      },
    });

    const still = await checkThreadsStillUnresolved(42, REPO, [
      "rest-thread-10",
      "rest-thread-11",
      "rest-thread-12",
    ]);
    expect([...still]).toEqual(["rest-thread-12", "rest-thread-11"]);
    expect(mockGraphql).toHaveBeenCalledWith(expect.any(String), {
      ids: ["PRRT_10", "PRRT_11"],
    });
  });

  it("keeps cached thread IDs unresolved under REST when thread resolution status is unavailable", async () => {
    mockReadRestFeedback.mockResolvedValueOnce({
      threads: [{ id: "rest-thread-1", reviewId: "PRR_1" }],
      unavailable: [{ field: "reviewThreads.status", reason: "unavailable" }],
    } as never);

    const still = await runWithGithubTransport("rest", () =>
      checkThreadsStillUnresolved(42, REPO, ["PRRT_1"]),
    );
    expect([...still]).toEqual(["PRRT_1"]);
  });

  it("matches resolved CCR REST threads by REST ID and GraphQL alias while preserving unmatched IDs", async () => {
    mockReadRestFeedback.mockResolvedValueOnce({
      threads: [
        { id: "rest-thread-1", reviewId: "PRR_1", isResolved: false },
        { id: "rest-thread-2", reviewId: "PRR_1", isResolved: true },
        { id: "rest-thread-3", reviewId: "PRR_1", isResolved: true },
      ],
      unavailable: [],
    } as never);
    mockResolveRestIdentity
      .mockResolvedValueOnce({
        repo: REPO,
        pr: 42,
        numericId: "2",
        kind: "thread",
        graphqlThreadId: "PRRT_2",
      })
      .mockRejectedValueOnce(new Error("no recorded identity"));

    const still = await runWithGithubTransport("rest", () =>
      checkThreadsStillUnresolved(42, REPO, [
        "rest-thread-1",
        "PRRT_2",
        "rest-thread-3",
        "PRRT_UNMATCHED",
      ]),
    );
    expect([...still]).toEqual(["rest-thread-1", "PRRT_UNMATCHED"]);
  });
});
