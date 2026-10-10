import { describe, expect, it } from "vitest";
import {
  registerHooks,
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphqlWithRateLimit,
} from "../../test-helpers/github/batch.test-support.mts";
import { fetchPrBatch } from "./batch.mts";
import { GitHubRequestError } from "./errors.mts";
import { BATCH_PR_QUERY, BATCH_PR_RECEIPT_QUERY } from "./queries.mts";

registerHooks();

describe("conditional BatchPr READY evidence", () => {
  it("keeps the ordinary BatchPr document unchanged", async () => {
    await fetchPrBatch(42, REPO);
    expect(mockGraphqlWithRateLimit.mock.calls[0]?.[0]).toBe(BATCH_PR_QUERY);
    expect(BATCH_PR_QUERY).not.toContain("receiptSummary:");
  });

  it("halves the batch's first context page so the sibling stays at the 1-point floor", () => {
    // Each first-page context carries an annotations(first: 1) probe: 100 connection-requests.
    // With the sibling's ~55 that totals 192 (2 points); 50 contexts bring it to 142 (1 point).
    expect(BATCH_PR_QUERY.match(/contexts\(first: \d+\)/g)).toEqual(["contexts(first: 100)"]);
    expect(BATCH_PR_RECEIPT_QUERY.match(/contexts\(first: \d+\)/g)).toEqual([
      "contexts(first: 50)",
    ]);
  });

  it("selects the exact PollSummaryPr sibling only on an eligible full read", async () => {
    const raw = makeRawPr({
      baseRefOid: "base-1",
      commits: { nodes: [{ commit: { oid: "abc123", statusCheckRollup: null } }] },
    });
    const summary = {
      number: 42,
      headRefOid: "abc123",
      baseRefOid: "base-1",
      commits: { nodes: [{ commit: { oid: "abc123", statusCheckRollup: null } }] },
    };
    const response = makeResponse(raw);
    mockGraphqlWithRateLimit.mockResolvedValueOnce({
      data: {
        ...response.data,
        repository: { ...response.data.repository, receiptSummary: summary },
      },
    });

    const result = await fetchPrBatch(42, REPO, { includeReceiptSummary: true });

    expect(mockGraphqlWithRateLimit.mock.calls[0]?.[0]).toBe(BATCH_PR_RECEIPT_QUERY);
    expect(BATCH_PR_RECEIPT_QUERY).toContain(
      "receiptSummary: pullRequest(number: $pr) { ...PollSummaryPr }",
    );
    expect(result.receiptSummary).toBe(summary);
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(1);
  });

  it("retries plain BatchPr when only the combined document exceeds GraphQL resource limits", async () => {
    mockGraphqlWithRateLimit.mockRejectedValueOnce(
      new GitHubRequestError("combined resource limit", {
        status: 200,
        graphqlErrors: [
          { message: "Resource limits for this query exceeded", type: "RESOURCE_LIMITS_EXCEEDED" },
        ],
      }),
    );
    const result = await fetchPrBatch(42, REPO, { includeReceiptSummary: true });
    expect(result.receiptSummary).toBeUndefined();
    expect(mockGraphqlWithRateLimit.mock.calls.map(([query]) => query)).toEqual([
      BATCH_PR_RECEIPT_QUERY,
      BATCH_PR_QUERY,
    ]);
  });

  it("retries plain BatchPr when a field error is confined to the optional receipt sibling", async () => {
    mockGraphqlWithRateLimit.mockRejectedValueOnce(
      new GitHubRequestError("receipt access denied", {
        status: 200,
        graphqlErrors: [
          {
            message: "Resource not accessible by personal access token",
            path: ["repository", "receiptSummary", "reviews"],
          },
        ],
      }),
    );
    const result = await fetchPrBatch(42, REPO, { includeReceiptSummary: true });
    expect(result.receiptSummary).toBeUndefined();
    expect(mockGraphqlWithRateLimit.mock.calls.map(([query]) => query)).toEqual([
      BATCH_PR_RECEIPT_QUERY,
      BATCH_PR_QUERY,
    ]);
  });

  it("keeps required BatchPr field errors fatal even alongside optional sibling errors", async () => {
    mockGraphqlWithRateLimit.mockRejectedValueOnce(
      new GitHubRequestError("required field access denied", {
        status: 200,
        graphqlErrors: [
          {
            message: "Resource not accessible by personal access token",
            path: ["repository", "receiptSummary", "reviews"],
          },
          {
            message: "Resource not accessible by personal access token",
            path: ["repository", "pullRequest", "commits"],
          },
        ],
      }),
    );
    await expect(fetchPrBatch(42, REPO, { includeReceiptSummary: true })).rejects.toMatchObject({
      exitCode: 77,
    });
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(1);
  });

  it("does not retry a combined error that also reports a secondary throttle", async () => {
    mockGraphqlWithRateLimit.mockRejectedValueOnce(
      new GitHubRequestError("secondary rate limit", {
        status: 200,
        graphqlErrors: [
          { message: "Resource limits for this query exceeded", type: "RESOURCE_LIMITS_EXCEEDED" },
          { message: "secondary rate limit" },
        ],
      }),
    );
    await expect(fetchPrBatch(42, REPO, { includeReceiptSummary: true })).rejects.toMatchObject({
      exitCode: 75,
    });
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(1);
  });
});
