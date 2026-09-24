import { beforeEach, describe, expect, it, vi } from "vitest";
import { row } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";

vi.mock("../github/poll-summary.mts", () => ({ fetchPollSummary: vi.fn() }));
vi.mock("../github/client.mts", () => ({ getRepoInfo: vi.fn() }));
vi.mock("../github/api-telemetry.mts", () => ({
  withApiTelemetryScope: vi.fn((callback: () => unknown) => callback()),
  summarizeApiTelemetry: vi.fn(() => undefined),
}));
vi.mock("../github/stack-merge-selector.mts", () => ({
  checkStackMergeSelector: vi.fn(() => {
    throw new Error("unexpected merge selector lookup");
  }),
}));

import { fetchPollSummary } from "../github/poll-summary.mts";
import { checkStackMergeSelector } from "../github/stack-merge-selector.mts";
import type { PollSummaryCommandOptions, PollSummaryResult } from "../types.mts";
import { runPollSummary } from "./poll-summary.mts";

const mockFetch = vi.mocked(fetchPollSummary);
const mockSelector = vi.mocked(checkStackMergeSelector);
const repo = { owner: "acme", name: "widgets" };
const stackSelection = { kind: "stack", anchor: 3, stackNumber: 9, stackSize: 3 } as const;
const stackOpts: PollSummaryCommandOptions = {
  prNumbers: [],
  stackPrNumber: 3,
  targetRepository: repo,
};
const readyBottom = row(1, 1, { readyReceipt: true });

beforeEach(() => {
  mockFetch.mockReset();
  mockSelector.mockClear();
});

describe("stack merge selector lookup", () => {
  it("checks only the drainable bottom PR when merge was requested", async () => {
    mockSelector.mockResolvedValueOnce({ status: "verified" });
    mockFetch.mockResolvedValue({ selection: stackSelection, prs: [readyBottom, row(2, 2)] });

    const result = await runPollSummary({ ...stackOpts, merge: true });

    expect(mockSelector).toHaveBeenCalledExactlyOnceWith(1, repo);
    expect(result.prs.map((item) => item.mergeSelector)).toEqual([
      { status: "verified" },
      undefined,
    ]);
    expect(result.nextAction).toBe("merge");
    expect(result.instructions?.[0]).toContain("gh stack merge 1 --yes --squash");
  });

  it.each<
    [string, PollSummaryCommandOptions, PollSummaryResult["selection"], PollSummaryResult["prs"]]
  >([
    ["merge was not requested", stackOpts, stackSelection, [readyBottom]],
    [
      "the selection is not a stack",
      { prNumbers: [1], targetRepository: repo, merge: true },
      { kind: "prs", requested: [1] },
      [readyBottom],
    ],
    ["no layer can drain", { ...stackOpts, merge: true }, stackSelection, [row(1, 1), row(2, 2)]],
  ])("skips the lookup when %s", async (_case, options, selection, prs) => {
    mockFetch.mockResolvedValue({ selection, prs });

    const result = await runPollSummary(options);

    expect(mockSelector).not.toHaveBeenCalled();
    expect(result.prs.every((item) => item.mergeSelector === undefined)).toBe(true);
  });
});
