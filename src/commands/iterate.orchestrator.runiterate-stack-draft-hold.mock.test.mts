import { describe, it, expect, vi } from "vitest";

const { mockFetchPollSummary } = vi.hoisted(() => ({ mockFetchPollSummary: vi.fn() }));
vi.mock("../github/poll-summary.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../github/poll-summary.mts")>()),
  fetchPollSummary: mockFetchPollSummary,
}));

import {
  registerIterateHooks,
  defaultConfig,
  makeOpts,
  makeReport,
  mockClearStallState,
  mockFetch,
  mockLoadConfig,
  mockReadStallState,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import type { IterateCommandOptions, ShepherdStatus, StackStatus } from "../types.mts";

registerIterateHooks();

const openRequirements = {
  approvals: { current: 0, requiredCount: 0 },
  conversationsResolved: { resolved: true, unresolvedCount: 0, required: false },
};

const bottomLayer: StackStatus = { number: 7, size: 3, position: 1, baseRefName: "main" };
const upperLayer: StackStatus = { number: 7, size: 3, position: 2, baseRefName: "feature-a" };
const draftParentStack = {
  prs: [
    {
      pr: 41,
      state: "OPEN",
      isDraft: true,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      stack: bottomLayer,
    },
    { pr: 42, state: "OPEN", stack: upperLayer },
  ],
};
async function runDraft(
  stack: StackStatus | undefined,
  opts: Partial<IterateCommandOptions> = {},
  status: ShepherdStatus = "READY",
) {
  mockRunCheck.mockResolvedValue(
    makeReport({
      status,
      mergeStatus: {
        status: "CLEAN",
        state: "OPEN",
        isDraft: true,
        mergeable: "MERGEABLE",
        reviewDecision: null,
        blockingBotReviewInProgress: false,
        mergeStateStatus: "CLEAN",
        ...(stack && { mergeRequirements: { ...openRequirements, stack } }),
      },
    }),
  );
  mockUpdateReadyDelay.mockResolvedValue({
    isReady: false,
    shouldCancel: false,
    remainingSeconds: 600,
  });
  const result = await runIterate(makeOpts(opts));
  expect(result.action).toBe("wait");
  expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith("/graphql"))).toBe(false);
  return result.action === "wait" ? result.stackDraftHold : "not-wait";
}

describe("runIterate — held native stack drafts", () => {
  it("holds a READY bottom-layer draft whose session disables automatic mark-ready", async () => {
    await expect(runDraft(bottomLayer, { noAutoMarkReady: true })).resolves.toEqual({
      kind: "auto-mark-ready-disabled",
    });
    expect(mockFetchPollSummary).not.toHaveBeenCalled();
  });

  it("holds a pending stack draft when the configuration disables automatic mark-ready", async () => {
    mockLoadConfig.mockReturnValue({
      ...defaultConfig(),
      actions: { ...defaultConfig().actions, autoMarkReady: false },
    });

    await expect(runDraft(bottomLayer, {}, "IN_PROGRESS")).resolves.toEqual({
      kind: "auto-mark-ready-disabled",
    });
  });

  it("marks a READY upper-layer draft ready without reading lower layers", async () => {
    mockFetchPollSummary.mockResolvedValue(draftParentStack);
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        mergeStatus: {
          status: "CLEAN",
          state: "OPEN",
          isDraft: true,
          mergeable: "MERGEABLE",
          reviewDecision: null,
          blockingBotReviewInProgress: false,
          mergeStateStatus: "CLEAN",
          mergeRequirements: { ...openRequirements, stack: upperLayer },
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("mark_ready");
    expect(mockFetchPollSummary).not.toHaveBeenCalled();
  });

  it("holds an upper draft when automatic mark-ready is disabled, without naming a lower layer", async () => {
    mockFetchPollSummary.mockResolvedValue(draftParentStack);

    await expect(runDraft(upperLayer, { noAutoMarkReady: true })).resolves.toEqual({
      kind: "auto-mark-ready-disabled",
    });
    expect(mockFetchPollSummary).not.toHaveBeenCalled();
  });

  it("keeps the stall guard for an upper draft whose session disables mark-ready", async () => {
    mockFetchPollSummary.mockResolvedValue(draftParentStack);

    await runDraft(upperLayer, { noAutoMarkReady: true });

    expect(mockClearStallState).not.toHaveBeenCalled();
    expect(mockReadStallState).toHaveBeenCalled();
  });

  it("keeps iterating a pending stack draft that can still be marked ready automatically", async () => {
    await expect(runDraft(bottomLayer, {}, "IN_PROGRESS")).resolves.toBeUndefined();
  });

  it("keeps the ordinary wait for a draft outside a native stack", async () => {
    await expect(runDraft(undefined, { noAutoMarkReady: true })).resolves.toBeUndefined();
  });
});
