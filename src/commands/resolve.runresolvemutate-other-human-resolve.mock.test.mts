import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeThread,
  mockApplyResolveOptions,
  mockFetchPrBatch,
  mockLoadConfig,
} from "../../test-helpers/commands/resolve.test-support.mts";
import { runResolveMutate } from "./resolve.mts";
import { addPrShepherdMarker } from "../comments/marker.mts";
import type { ReviewThread } from "../types.mts";

function withOtherHumanResolve(policy: "none" | "outdated" | "always") {
  mockLoadConfig.mockReturnValue({
    botUsernames: ["coderabbitai"],
    ignoreChecks: [],
    iterate: {
      fixAttemptsPerThread: 3,
      stallTimeoutMinutes: 60,
      minimizeApprovals: false,
      minimizeComments: "all",
      behindBaseHint: "",
      resolveOtherHumanThreads: policy,
    },
    watch: { readyDelayMinutes: 10, graphqlQuotaWarnings: [] },
    resolve: { shaPoll: { intervalMs: 2000, maxAttempts: 10 } },
    checks: { ciTriggerEvents: ["pull_request", "pull_request_target"], ignoreLogLines: [] },
    mergeStatus: { blockingReviewerLogins: ["copilot"] },
    actions: {
      autoMinimizeSuppressed: true,
      autoMarkReady: true,
      neverCancelRuns: [],
      workWhileQueued: false,
    },
  });
}

async function mutateOtherHuman(
  thread: ReviewThread,
  opts: { policy?: "none" | "outdated" | "always"; reply?: boolean } = {},
) {
  if (opts.policy) withOtherHumanResolve(opts.policy);
  mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });
  const reply = opts.reply !== false;
  return runResolveMutate({
    ...BASE_OPTS,
    resolveThreadIds: [thread.id],
    ...(reply ? { replyThreadIds: [thread.id], dismissMessage: "done" } : {}),
  });
}

function expectOtherHumanResolve(result: { skippedHumanResolves?: string[] }, resolved: boolean) {
  expect(mockApplyResolveOptions).toHaveBeenCalledWith(
    42,
    { owner: "owner", name: "repo" },
    expect.objectContaining({ resolveThreadIds: resolved ? ["t-other"] : [] }),
  );
  expect(result.skippedHumanResolves).toEqual(resolved ? undefined : ["t-other"]);
}

registerHooks();

describe("runResolveMutate — other-human resolve policy", () => {
  const other = (overrides: Partial<ReviewThread> = {}) =>
    makeThread({ id: "t-other", author: "bob", authorType: "User", ...overrides });

  it("does not extend the paired exception to another human's thread", async () => {
    expectOtherHumanResolve(await mutateOtherHuman(other()), false);
  });

  it("resolves another human's thread when iterate.resolveOtherHumanThreads is always", async () => {
    expectOtherHumanResolve(await mutateOtherHuman(other(), { policy: "always" }), true);
  });

  it("resolves an outdated other-human thread when the enum is outdated", async () => {
    expectOtherHumanResolve(
      await mutateOtherHuman(other({ isOutdated: true }), { policy: "outdated" }),
      true,
    );
  });

  it("skips an active other-human resolve when the enum is outdated", async () => {
    expectOtherHumanResolve(await mutateOtherHuman(other(), { policy: "outdated" }), false);
  });

  it("allows a marker-ended other-human resolve without another reply when always", async () => {
    const marked = other({
      comments: [
        {
          id: "c-bob",
          isMinimized: false,
          author: "bob",
          authorType: "User",
          body: "please fix this",
          url: "https://example.test/c-bob",
          createdAtUnix: 10,
        },
        {
          id: "c-retry",
          isMinimized: false,
          author: "alice",
          authorType: "User",
          body: addPrShepherdMarker("retrying resolve"),
          url: "https://example.test/c-retry",
          createdAtUnix: 20,
        },
      ],
    });
    expectOtherHumanResolve(
      await mutateOtherHuman(marked, { policy: "always", reply: false }),
      true,
    );
  });
});
