import { beforeEach, describe, expect, it, vi } from "vitest";
import { findStaleNativeStackAncestry } from "./stale-ancestry.mts";
import type { ShepherdReport } from "../../types/report.mts";

const mockReadStackTopology = vi.hoisted(() => vi.fn());
vi.mock("../../github/stack-read.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../github/stack-read.mts")>()),
  readStackTopology: mockReadStackTopology,
}));

const repo = { owner: "acme", name: "widgets" };
const childReport = {
  pr: 42,
  mergeStatus: {
    mergeRequirements: { stack: { number: 7, size: 3, position: 2, baseRefName: "main" } },
  },
} as ShepherdReport;
const gap = {
  parentPr: 41,
  parentHeadRefName: "feature-parent",
  parentHeadRefOid: "parent-current",
  childPr: 42,
  childBaseRefName: "feature-parent",
  childBaseRefOid: "parent-old",
};

function member(number: number, head: string, base: string, baseRefOid: string) {
  return {
    number,
    state: "OPEN",
    headRefName: head,
    headRefOid: `${head}-current`,
    baseRefName: base,
    baseRefOid,
  };
}

/** Parent #41, child #42, top #43; override one member's recorded base OID. */
function topology(childBaseRefOid: string, topBaseRefOid = "feature-child-current") {
  return {
    stackNumber: 7,
    stackSize: 3,
    viewerCanAdminister: false,
    ordered: [
      { ...member(41, "feature-parent", "main", "main-base"), headRefOid: "parent-current" },
      member(42, "feature-child", "feature-parent", childBaseRefOid),
      member(43, "feature-top", "feature-child", topBaseRefOid),
    ],
  };
}

beforeEach(() => vi.clearAllMocks());

describe("findStaleNativeStackAncestry", () => {
  it("returns only a verified gap for the shepherded child", async () => {
    mockReadStackTopology.mockResolvedValue(topology("parent-old"));

    const result = await findStaleNativeStackAncestry(childReport, repo);

    expect(result).toMatchObject(gap);
    expect(result?.instructions.join("\n")).toContain("gh stack rebase --upstack --no-trunk");
    expect(result?.instructions.join("\n")).toContain("`gh stack checkout 7`");
    expect(result?.instructions.join("\n")).toContain("gh stack push");
    expect(mockReadStackTopology).toHaveBeenCalledWith(42, repo);
  });

  it.each([
    ["a root layer", { number: 7, size: 3, position: 1, baseRefName: "main" }],
    ["a layer without stack metadata", undefined],
  ])("does not fetch or repair %s", async (_description, stack) => {
    const report = {
      ...childReport,
      mergeStatus: { mergeRequirements: stack ? { stack } : undefined },
    } as ShepherdReport;

    await expect(findStaleNativeStackAncestry(report, repo)).resolves.toBeNull();
    expect(mockReadStackTopology).not.toHaveBeenCalled();
  });

  it("does not route a current boundary or another child to repair", async () => {
    mockReadStackTopology.mockResolvedValue(topology("parent-current", "feature-child-old"));
    await expect(findStaleNativeStackAncestry(childReport, repo)).resolves.toBeNull();

    mockReadStackTopology.mockResolvedValue(topology("parent-current"));
    await expect(findStaleNativeStackAncestry(childReport, repo)).resolves.toBeNull();
  });

  it("fails closed when the stack snapshot cannot be read", async () => {
    mockReadStackTopology.mockRejectedValue(new Error("rate limited"));

    await expect(findStaleNativeStackAncestry(childReport, repo)).resolves.toBeNull();
  });
});

describe("verified stale-boundary guidance", () => {
  it("includes the observed refs and safe repair sequence", async () => {
    mockReadStackTopology.mockResolvedValue(topology("parent-old"));
    const instructions = (await findStaleNativeStackAncestry(childReport, repo))?.instructions;

    expect(instructions).toEqual([
      "PR #42 records base `feature-parent` at `parent-old`, but its open parent PR #41 currently ends at `feature-parent` `parent-current`.",
      "From a clean checkout of `acme/widgets`, if `gh stack` does not track stack #7 locally, import it with `gh stack checkout 7`, then confirm every layer's local branch is at its PR's head commit — a stale local layer would overwrite that PR's newer commits on push. Then check out the parent stack branch `feature-parent` and run `gh stack rebase --upstack --no-trunk`; if it stops on a conflict, resolve it and run `gh stack rebase --continue`.",
      "Push the rewritten stack with `gh stack push`.",
    ]);
  });
});
