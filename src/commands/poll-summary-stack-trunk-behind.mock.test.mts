import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../github/poll-summary.mts", () => ({ fetchPollSummary: vi.fn() }));
vi.mock("../github/client.mts", () => ({ getRepoInfo: vi.fn() }));
vi.mock("../util/sleep.mts", () => ({ sleep: vi.fn() }));
vi.mock("../github/merge-target-rules.mts", () => ({ loadBaseBehindBy: vi.fn() }));

import { row } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import { formatPollSummaryResult } from "../cli/poll-summary-formatter.mts";
import { projectStackOverview } from "../cli/stack-overview.mts";
import { loadBaseBehindBy } from "../github/merge-target-rules.mts";
import { fetchPollSummary } from "../github/poll-summary.mts";
import type { PollSummaryItem } from "../types.mts";
import { runPollSummary } from "./poll-summary.mts";

const mockFetch = vi.mocked(fetchPollSummary);
const mockBehind = vi.mocked(loadBaseBehindBy);
const ready = { readyReceipt: true } as const;
const base = {
  targetRepository: { owner: "acme", name: "widgets" },
  intervalSeconds: 60,
  timeoutSeconds: 0,
  debounceSeconds: 0,
  tick: true,
  stackPrNumber: 3,
  merge: true,
};

function layers(): PollSummaryItem[] {
  return [row(1, 1, ready), row(2, 2, ready), row(3, 3, ready)];
}

function stage(prs: PollSummaryItem[], stackNumber: number) {
  mockFetch.mockResolvedValue({
    selection: { kind: "stack" as const, anchor: 1, stackNumber, stackSize: prs.length },
    prs,
  });
}

let counter = 0;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

describe("stack merge trunk pre-check", () => {
  it("compares trunk with the top layer head and prints a read-only pre-check first", async () => {
    stage(layers(), 8200 + ++counter);
    mockBehind.mockResolvedValue(2);
    const result = await runPollSummary(base);
    expect(mockBehind).toHaveBeenCalledOnce();
    expect(mockBehind).toHaveBeenCalledWith("acme", "widgets", "main", "3".padStart(40, "0"));
    expect(result.nextAction).toBe("merge");
    const [check, merge] = result.instructions!;
    expect(check).toMatch(/^1\. Before merging, check the top layer against trunk/);
    expect(check).toContain("Trunk `main` has 2 commits that PR #3 lacks");
    expect(check).toContain("git fetch <remote> main");
    expect(check).toContain(`git merge-tree --write-tree FETCH_HEAD ${"3".padStart(40, "0")}`);
    expect(check).toContain("exits 0");
    expect(check).toContain("exits 1");
    expect(check).toContain("check out the head branch of PR #1 and run `gh stack rebase`");
    expect(check).toContain('Playbook: "Branch update".');
    expect(merge).toMatch(/^2\. Run `GH_REPO=acme\/widgets gh stack merge 3 --yes --squash`/);
    expect(merge).toContain("`Merge conflict detected`");
    expect(merge).toContain("Do not rerun the merge");
    expect(result.prs.find((item) => item.pr === 3)?.trunkBehindBy).toBe(2);
    expect(result.prs.filter((item) => item.trunkBehindBy)).toHaveLength(1);
  });

  it("surfaces `trunk behind N` identically in text and JSON", async () => {
    stage(layers(), 8200 + ++counter);
    mockBehind.mockResolvedValue(1);
    const result = await runPollSummary(base);
    expect(formatPollSummaryResult(result)).toContain("trunk behind 1");
    const json = projectStackOverview(result);
    expect(json.prs.find((layer) => layer.pr === 3)).toMatchObject({ trunkBehindBy: 1 });
    expect(json.prs.find((layer) => layer.pr === 1)).not.toHaveProperty("trunkBehindBy");
    expect(result.instructions![0]).toContain("1 commit that PR #3 lacks");
  });

  it("leaves the merge step alone when trunk is not ahead", async () => {
    stage(layers(), 8200 + ++counter);
    mockBehind.mockResolvedValue(0);
    const result = await runPollSummary(base);
    expect(result.instructions![0]).toMatch(/^1\. Run `GH_REPO=acme\/widgets gh stack merge 3/);
    expect(result.instructions!.join("\n")).not.toContain("merge-tree");
    expect(result.prs.some((item) => item.trunkBehindBy !== undefined)).toBe(false);
    expect(formatPollSummaryResult(result)).not.toContain("trunk behind");
  });

  it("skips the compare when the merge lands only the bottom layer", async () => {
    stage(
      [row(1, 1, ready), row(2, 2, { reasons: ["ci-failing"], action: "triage" })],
      8200 + ++counter,
    );
    const result = await runPollSummary({ ...base, stackMerge: { kind: "ready" } });
    expect(mockBehind).not.toHaveBeenCalled();
    expect(result.instructions![0]).toContain("gh stack merge 1");
    expect(result.instructions![0]).not.toContain("merge-tree");
  });

  it("checks the --merge-through target, not the stack top", async () => {
    stage(layers(), 8200 + ++counter);
    mockBehind.mockResolvedValue(4);
    const result = await runPollSummary({ ...base, stackMerge: { kind: "through", pr: 2 } });
    expect(mockBehind).toHaveBeenCalledWith("acme", "widgets", "main", "2".padStart(40, "0"));
    expect(result.instructions![0]).toContain("PR #2");
    expect(result.instructions![1]).toContain("gh stack merge 2");
  });

  it("still prints the pre-check as unverified when the compare fails", async () => {
    stage(layers(), 8200 + ++counter);
    mockBehind.mockRejectedValue(new Error("compare boom"));
    const result = await runPollSummary(base);
    expect(result.nextAction).toBe("merge");
    expect(result.instructions![0]).toContain("could not compare trunk `main` with PR #3");
    expect(result.instructions![0]).toContain("merge-tree");
    expect(result.instructions![1]).toContain("gh stack merge 3");
    expect(formatPollSummaryResult(result)).toContain("trunk behind unknown");
    expect(projectStackOverview(result).prs.at(-1)).toMatchObject({ trunkBehindUnknown: true });
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining("compare boom"));
  });

  it("does not compare without a merge request", async () => {
    stage(layers(), 8200 + ++counter);
    await runPollSummary({ ...base, merge: false });
    expect(mockBehind).not.toHaveBeenCalled();
  });
});
