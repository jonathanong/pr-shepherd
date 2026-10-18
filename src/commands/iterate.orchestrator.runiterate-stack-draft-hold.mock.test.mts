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
  blockingBotReviewInProgress = false,
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
        blockingBotReviewInProgress,
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
  expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith("/graphql"))).toBe(false);
  return result;
}

describe("runIterate — held native stack drafts", () => {
  it("holds a READY bottom-layer draft whose session disables automatic mark-ready", async () => {
    await expect(runDraft(bottomLayer, { noAutoMarkReady: true })).resolves.toMatchObject({
      action: "cancel",
      reason: "auto-mark-ready-disabled",
    });
    expect(mockFetchPollSummary).not.toHaveBeenCalled();
  });

  it("stops when configuration disables automatic mark-ready, even with merge requested", async () => {
    mockLoadConfig.mockReturnValue({
      ...defaultConfig(),
      actions: { ...defaultConfig().actions, autoMarkReady: false },
    });
    await expect(runDraft(undefined, { merge: true })).resolves.toMatchObject({
      action: "cancel",
      reason: "auto-mark-ready-disabled",
    });
  });

  it("does not hold a pending stack draft when automatic mark-ready is disabled", async () => {
    mockLoadConfig.mockReturnValue({
      ...defaultConfig(),
      actions: { ...defaultConfig().actions, autoMarkReady: false },
    });

    await expect(runDraft(bottomLayer, {}, "IN_PROGRESS")).resolves.toMatchObject({
      action: "wait",
    });
  });

  it("surfaces review work before stopping a disabled draft", async () => {
    const report = makeReport();
    report.mergeStatus.isDraft = true;
    report.threads.firstLook = [
      {
        id: "PRRT_first",
        path: "src/example.mts",
        line: 1,
        body: "Review feedback",
        author: "reviewer",
        url: "https://github.com/owner/repo/pull/42#discussion_r1",
        isResolved: true,
        isOutdated: false,
        autoResolved: false,
        firstLookStatus: "resolved",
        startLine: null,
        authorType: "User",
      },
    ];
    mockRunCheck.mockResolvedValue(report);
    const result = await runIterate(makeOpts({ noAutoMarkReady: true }));
    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") expect(result.fix.firstLookThreads).toHaveLength(1);
  });

  it("keeps waiting for a blocking bot review", async () => {
    await expect(
      runDraft(undefined, { noAutoMarkReady: true }, "READY", true),
    ).resolves.toMatchObject({ action: "wait" });
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

    await expect(runDraft(upperLayer, { noAutoMarkReady: true })).resolves.toMatchObject({
      action: "cancel",
      reason: "auto-mark-ready-disabled",
    });
    expect(mockFetchPollSummary).not.toHaveBeenCalled();
  });

  it("stops before the stall guard for an upper draft whose session disables mark-ready", async () => {
    mockFetchPollSummary.mockResolvedValue(draftParentStack);

    await runDraft(upperLayer, { noAutoMarkReady: true });

    expect(mockClearStallState).toHaveBeenCalled();
    expect(mockReadStallState).not.toHaveBeenCalled();
  });

  it("keeps iterating a pending stack draft that can still be marked ready automatically", async () => {
    await expect(runDraft(bottomLayer, {}, "IN_PROGRESS")).resolves.toMatchObject({
      action: "wait",
    });
  });

  it("stops for a clean draft outside a native stack", async () => {
    await expect(runDraft(undefined, { noAutoMarkReady: true })).resolves.toMatchObject({
      action: "cancel",
      reason: "auto-mark-ready-disabled",
    });
  });
});
