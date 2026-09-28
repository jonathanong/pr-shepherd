import { describe, expect, it, vi } from "vitest";
import {
  mockGraphqlWithRateLimit,
  registerHooks,
} from "../../test-helpers/github/batch.test-support.mts";
import type { RawThread } from "./batch-raw-types.mts";
import { GitHubRequestError } from "./errors.mts";
import { hydrateThreadCommentPages } from "./thread-comments.mts";

registerHooks();

function thread(id: string): RawThread {
  return {
    id,
    isResolved: false,
    isOutdated: false,
    viewerCanReply: true,
    viewerCanResolve: true,
    comments: { pageInfo: { hasNextPage: true, endCursor: "first" }, nodes: [] },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function response(remaining: number, hasNextPage: boolean) {
  return {
    data: {
      node: {
        comments: {
          pageInfo: { hasNextPage, endCursor: hasNextPage ? "second" : null },
          nodes: [],
        },
      },
    },
    rateLimit: { remaining, limit: 5000, resetAt: 100 },
  };
}

describe("thread comment pagination quota gate", () => {
  it("does not reopen after an out-of-order stale positive quota response", async () => {
    const zero = deferred<ReturnType<typeof response>>();
    const stale = deferred<ReturnType<typeof response>>();
    mockGraphqlWithRateLimit.mockImplementationOnce(() => zero.promise);
    mockGraphqlWithRateLimit.mockImplementationOnce(() => stale.promise);
    const pending = hydrateThreadCommentPages([thread("a"), thread("b")]);
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(2);
    zero.resolve(response(0, false));
    await vi.waitFor(() => expect(zero.promise).resolves.toBeDefined());
    stale.resolve(response(100, true));
    await expect(pending).rejects.toThrow("thread comment pagination incomplete");
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(2);
  });

  it("drains requests already in flight after a secondary failure without scheduling another page", async () => {
    const failed = deferred<ReturnType<typeof response>>();
    const inFlight = deferred<ReturnType<typeof response>>();
    mockGraphqlWithRateLimit.mockImplementationOnce(() => failed.promise);
    mockGraphqlWithRateLimit.mockImplementationOnce(() => inFlight.promise);
    const pending = hydrateThreadCommentPages([thread("a"), thread("b")]);
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(2);
    const secondary = new GitHubRequestError("secondary rate limit", { status: 403 });
    failed.reject(secondary);
    await vi.waitFor(() => expect(failed.promise).rejects.toBe(secondary));
    inFlight.resolve(response(100, true));
    await expect(pending).rejects.toBe(secondary);
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(2);
  });

  it("keeps the final quota at zero when an older positive response settles later", async () => {
    const zero = deferred<ReturnType<typeof response>>();
    const stale = deferred<ReturnType<typeof response>>();
    mockGraphqlWithRateLimit.mockImplementationOnce(() => zero.promise);
    mockGraphqlWithRateLimit.mockImplementationOnce(() => stale.promise);
    const pending = hydrateThreadCommentPages([thread("a"), thread("b")]);
    zero.resolve(response(0, false));
    await vi.waitFor(() => expect(zero.promise).resolves.toBeDefined());
    stale.resolve(response(100, false));
    const hydrated = await pending;
    expect(hydrated.rateLimit?.remaining).toBe(0);
    expect(hydrated.threads).toHaveLength(2);
  });
});
