import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockFetch,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("runIterate — mark_ready", () => {
  it("calls gh pr ready and returns action: mark_ready for READY + CLEAN + isDraft", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        mergeStatus: {
          status: "CLEAN",
          state: "OPEN" as const,
          isDraft: true,
          mergeable: "MERGEABLE",
          reviewDecision: "APPROVED",
          blockingBotReviewInProgress: false,
          mergeStateStatus: "CLEAN",
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("mark_ready");
    if (result.action === "mark_ready") {
      expect(result.markedReady).toBe(true);
    }

    // markPullRequestReadyForReview is a GraphQL mutation — verify a /graphql fetch was made
    const graphqlCalls = (mockFetch.mock.calls as Array<[string, RequestInit]>).filter(([url]) =>
      url.endsWith("/graphql"),
    );
    expect(graphqlCalls).toHaveLength(1);
  });

  it("does NOT mark ready when blockingBotReviewInProgress", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        mergeStatus: {
          status: "CLEAN",
          state: "OPEN" as const,
          isDraft: true,
          mergeable: "MERGEABLE",
          reviewDecision: "APPROVED",
          blockingBotReviewInProgress: true,
          mergeStateStatus: "CLEAN",
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("wait");
    const graphqlCalls = (mockFetch.mock.calls as Array<[string, RequestInit]>).filter(([url]) =>
      url.endsWith("/graphql"),
    );
    expect(graphqlCalls).toHaveLength(0);
  });
});
