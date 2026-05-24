import { vi, beforeEach, afterEach } from "vitest";
import type { IterateResult } from "../../src/types.mts";

vi.mock("../../src/commands/iterate/index.mts", () => ({ runIterate: vi.fn() }));

import { runIterate } from "../../src/commands/iterate/index.mts";

const mockRunIterate = vi.mocked(runIterate);

function makeWaitResult(overrides: Partial<IterateResult> = {}): IterateResult {
  return {
    action: "wait",
    pr: 42,
    repo: "owner/repo",
    status: "IN_PROGRESS",
    state: "OPEN",
    mergeStateStatus: "BLOCKED",
    mergeStatus: "BLOCKED",
    reviewDecision: "REVIEW_REQUIRED",
    blockingBotReviewInProgress: false,
    isDraft: false,
    shouldCancel: false,
    remainingSeconds: 0,
    summary: { passing: 2, failing: 0, inProgress: 1, skipped: 0, filtered: 0 },
    baseBranch: "main",
    checks: [],
    log: "WAIT: 2 passing, 1 in-progress",
    ...overrides,
  } as unknown as IterateResult;
}

function makeCancelResult(): IterateResult {
  return {
    action: "cancel",
    pr: 42,
    repo: "owner/repo",
    status: "READY",
    state: "MERGED",
    mergeStateStatus: "CLEAN",
    mergeStatus: "CLEAN",
    reviewDecision: "APPROVED",
    blockingBotReviewInProgress: false,
    isDraft: false,
    shouldCancel: true,
    remainingSeconds: 0,
    summary: { passing: 3, failing: 0, inProgress: 0, skipped: 0, filtered: 0 },
    baseBranch: "main",
    checks: [],
    reason: "merged",
    log: "CANCEL: PR #42 is merged — stopping",
  } as unknown as IterateResult;
}

function makeMarkReadyResult(): IterateResult {
  return {
    action: "mark_ready",
    pr: 42,
    repo: "owner/repo",
    status: "READY",
    state: "OPEN",
    mergeStateStatus: "CLEAN",
    mergeStatus: "CLEAN",
    reviewDecision: "APPROVED",
    blockingBotReviewInProgress: false,
    isDraft: false,
    shouldCancel: false,
    remainingSeconds: 0,
    summary: { passing: 3, failing: 0, inProgress: 0, skipped: 0, filtered: 0 },
    baseBranch: "main",
    checks: [],
    markedReady: true,
    log: "MARKED READY: PR #42 converted from draft to ready for review",
  } as unknown as IterateResult;
}

function registerPollHooks(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}

export { mockRunIterate, makeWaitResult, makeCancelResult, makeMarkReadyResult, registerPollHooks };
