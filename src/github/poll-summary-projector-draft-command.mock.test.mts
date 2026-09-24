import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));
vi.mock("../state/seen-comments.mts", () => ({
  loadSeenMap: vi.fn().mockResolvedValue(new Map()),
}));

import { summarizePollSummaryPr } from "./poll-summary-projector.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const repo = { owner: "acme", name: "widgets" };
const empty = { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] };

function draft(): RawSummaryPr {
  return {
    number: 42,
    title: "Draft stack layer",
    url: "https://github.com/acme/widgets/pull/42",
    state: "OPEN",
    isDraft: true,
    viewerCanUpdate: true,
    headRefName: "feature",
    headRefOid: "a".repeat(40),
    baseRefName: "main",
    baseRefOid: "b".repeat(40),
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    isInMergeQueue: false,
    mergeQueueEntry: null,
    stack: { number: 7, size: 1, baseRefName: "main" },
    stackEntry: { position: 1 },
    comments: empty,
    reviews: empty,
    reviewThreads: empty,
    commits: { nodes: [] },
  } as RawSummaryPr;
}

describe("draft stack poll commands", () => {
  beforeEach(() => {
    mockLoadConfig.mockReturnValue({
      cliCommand: ["pr-shepherd"],
      actions: { autoMarkReady: true, workWhileQueued: false },
      botUsernames: [],
      ignoreChecks: [],
      checks: { ciTriggerEvents: ["pull_request"] },
    });
  });

  it.each([
    ["the caller disables auto mark-ready", true, { noAutoMarkReady: true }],
    ["configuration disables auto mark-ready", false, {}],
  ] as const)("bounds the one-PR handoff when %s", async (_case, autoMarkReady, opts) => {
    mockLoadConfig.mockReturnValue({
      cliCommand: ["pr-shepherd"],
      actions: { autoMarkReady, workWhileQueued: false },
      botUsernames: [],
      ignoreChecks: [],
      checks: { ciTriggerEvents: ["pull_request"] },
    });

    const item = await summarizePollSummaryPr(draft(), repo, { stackPrNumber: 42, ...opts });

    expect(item).toMatchObject({ action: "wait", reasons: ["draft-auto-mark-ready-disabled"] });
    expect(item.pollCommand).toContain("--timeout 1s --debounce 0s --no-auto-mark-ready");
    expect(item.pollCommand).not.toContain("--until-terminal");
  });
});
