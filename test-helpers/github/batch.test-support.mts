import { vi, beforeEach } from "vitest";
export { REPO, makeRawPr, makeResponse } from "./batch-fixtures.mts";

vi.mock("../../src/github/client.mts", () => ({
  graphql: vi.fn(),
  graphqlWithRateLimit: vi.fn(),
}));

import { fetchPrBatch } from "../../src/github/batch.mts";
import { graphql, graphqlWithRateLimit } from "../../src/github/client.mts";
import { makeResponse } from "./batch-fixtures.mts";

const mockGraphql = vi.mocked(graphql);
const mockGraphqlWithRateLimit = vi.mocked(graphqlWithRateLimit);

// ---------------------------------------------------------------------------
// reviewSummaries — COMMENTED reviews surfaced for agent-driven minimize
// ---------------------------------------------------------------------------

export function registerHooks(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGraphql.mockResolvedValue(makeResponse());
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse());
  });
}

export { fetchPrBatch, graphql, graphqlWithRateLimit, mockGraphql, mockGraphqlWithRateLimit };
