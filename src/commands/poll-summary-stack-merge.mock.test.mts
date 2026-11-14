import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../github/poll-summary.mts", () => ({ fetchPollSummary: vi.fn() }));
vi.mock("../github/client.mts", () => ({ getRepoInfo: vi.fn() }));
vi.mock("../util/sleep.mts", () => ({ sleep: vi.fn() }));

import { row } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import { fetchPollSummary } from "../github/poll-summary.mts";
import type { PollSummaryItem } from "../types.mts";
import { runPollSummary } from "./poll-summary.mts";

const mockFetch = vi.mocked(fetchPollSummary);
const ready = { readyReceipt: true } as const;

let counter = 0;
const base = {
  targetRepository: { owner: "acme", name: "widgets" },
  intervalSeconds: 60,
  timeoutSeconds: 0,
  debounceSeconds: 0,
  tick: true,
  stackPrNumber: 3,
};

function summary(stackNumber: number, prs: PollSummaryItem[]) {
  // The fetch returns raw rows; ownership is applied from what the caller declared.
  return {
    selection: { kind: "stack" as const, anchor: 1, stackNumber, stackSize: prs.length },
    prs: prs.map(({ owned: _owned, ...item }) => item),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("stack merge requests", () => {
  it("merges a whole stack in one command and does not show ownership of every row", async () => {
    const stackNumber = 8100 + ++counter;
    mockFetch.mockResolvedValue(summary(stackNumber, [row(1, 1, ready), row(2, 2, ready)]));
    const result = await runPollSummary({ ...base, merge: true });
    expect(result.nextAction).toBe("merge");
    expect(result.instructions?.[0]).toContain("gh stack merge 2 --yes --squash");
    expect(result.instructions?.[0]).toContain("PRs #1, #2");
    expect(result.prs.some((item) => "owned" in item)).toBe(false);
    expect(result.selection).not.toHaveProperty("owned");
  });

  it("keeps ownership on the rows when the caller listed its PRs", async () => {
    const stackNumber = 8100 + ++counter;
    mockFetch.mockResolvedValue(summary(stackNumber, [row(1, 1, ready), row(2, 2, ready)]));
    const result = await runPollSummary({
      ...base,
      stackOwned: [1],
      stackMerge: { kind: "ready" },
      merge: true,
    });
    expect(result.selection).toMatchObject({ owned: [1] });
    expect(result.prs.map((item) => item.owned)).toEqual([true, undefined]);
    expect(result.instructions?.[0]).toContain("PR #1 alone");
  });

  it("rejects a listed PR that is not in the stack", async () => {
    mockFetch.mockResolvedValue(summary(8100 + ++counter, [row(1, 1, ready)]));
    await expect(runPollSummary({ ...base, stackOwned: [1, 9] })).rejects.toThrow(
      "PR #9 is not in native stack",
    );
  });

  it("explains lagging upper layers instead of merging the ready lower one", async () => {
    mockFetch.mockResolvedValue(summary(8100 + ++counter, [row(1, 1, ready), row(2, 2)]));
    const result = await runPollSummary({ ...base, merge: true });
    expect(result.nextAction).not.toBe("merge");
    const text = result.instructions?.join("\n") ?? "";
    expect(text).not.toContain("gh stack merge");
    expect(text).toContain("Owned layer #1 is ready");
    expect(text).toContain("--merge-ready");
  });

  it("escalates when a layer joins the stack after the merge was requested", async () => {
    const stackNumber = 8100 + ++counter;
    mockFetch.mockResolvedValueOnce(summary(stackNumber, [row(1, 1, ready), row(2, 2, ready)]));
    const first = await runPollSummary({ ...base, merge: true });
    expect(first.nextAction).toBe("merge");
    mockFetch.mockResolvedValueOnce(
      summary(stackNumber, [row(1, 1, ready), row(2, 2, ready), row(3, 3, ready)]),
    );
    const second = await runPollSummary({ ...base, merge: true });
    expect(second.nextAction).toBe("escalate");
    expect(second.addedLayers).toEqual([3]);
    expect(second.instructions?.[0]).toContain("`unapproved-stack-layer`");
    expect(second.instructions?.join("\n")).not.toContain("gh stack merge");
  });

  it("approves only through the named PR for --merge-through", async () => {
    const stackNumber = 8100 + ++counter;
    mockFetch.mockResolvedValueOnce(summary(stackNumber, [row(1, 1, ready), row(2, 2, ready)]));
    await runPollSummary({ ...base, merge: true, stackMerge: { kind: "through", pr: 2 } });
    // A layer above the target joining later is outside the request.
    mockFetch.mockResolvedValueOnce(
      summary(stackNumber, [row(1, 1, ready), row(2, 2, ready), row(3, 3, ready)]),
    );
    const result = await runPollSummary({
      ...base,
      merge: true,
      stackMerge: { kind: "through", pr: 2 },
    });
    expect(result.nextAction).toBe("merge");
    expect(result.instructions?.[0]).toContain("gh stack merge 2 --yes --squash");
    expect(result.instructions?.[0]).toContain("#3 stays open above it");
  });

  it("never merges without a merge request", async () => {
    mockFetch.mockResolvedValue(summary(8100 + ++counter, [row(1, 1, ready), row(2, 2, ready)]));
    const result = await runPollSummary(base);
    expect(result.instructions?.join("\n") ?? "").not.toContain("gh stack merge");
  });
});
