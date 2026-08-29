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
