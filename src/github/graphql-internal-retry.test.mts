import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GitHubRequestError } from "./errors.mts";
import { withGraphQlInternalRetry } from "./graphql-internal-retry.mts";

const internal = () =>
  new GitHubRequestError("GitHub GraphQL error (no data)", {
    status: 200,
    graphqlErrors: [{ message: "Something went wrong while executing your query" }],
  });

describe("withGraphQlInternalRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    "mutation { x }",
    "MUTATION BulkApply { x }",
    "# c\nmutation Foo { x }",
    '"""ready"""\nmutation { x }',
  ])("does not retry INTERNAL for mutation document %j", async (document) => {
    const run = vi.fn().mockRejectedValue(internal());
    await expect(withGraphQlInternalRetry(document, run)).rejects.toBeInstanceOf(
      GitHubRequestError,
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("retries a resource-limit error for a read and surfaces it after retries", async () => {
    const limited = new GitHubRequestError(
      "GitHub GraphQL error: Resource limits for this query exceeded",
      {
        status: 200,
        graphqlErrors: [{ message: "Resource limits for this query exceeded" }],
      },
    );
    const run = vi.fn().mockRejectedValue(limited);
    const promise = withGraphQlInternalRetry("{ PollStackSummary }", run);
    const assertion = expect(promise).rejects.toBe(limited);
    await vi.runAllTimersAsync();
    await assertion;
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("does not retry a resource-limit error for a mutation", async () => {
    const limited = new GitHubRequestError(
      "GitHub GraphQL error: Resource limits for this query exceeded",
      {
        status: 200,
        graphqlErrors: [{ type: "RESOURCE_LIMITS_EXCEEDED", message: "limit" }],
      },
    );
    const run = vi.fn().mockRejectedValue(limited);
    await expect(withGraphQlInternalRetry("mutation { x }", run)).rejects.toBe(limited);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it.each(["{ BatchPr }", "query BatchPr { x }", "# only comment", '"""unterminated'])(
    "retries INTERNAL for read document %j",
    async (document) => {
      const run = vi.fn().mockRejectedValueOnce(internal()).mockResolvedValueOnce("ok");
      const promise = withGraphQlInternalRetry(document, run);
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe("ok");
      expect(run).toHaveBeenCalledTimes(2);
    },
  );
});
