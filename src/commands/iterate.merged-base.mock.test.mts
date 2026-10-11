import { describe, expect, it, vi } from "vitest";
import {
  makeOpts,
  makeReport,
  mockRunCheck,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import { formatIterateResult } from "../cli/iterate-formatter.mts";
import { projectIterateLean } from "../cli/iterate-lean.mts";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("./iterate/merged-base-pull-requests.mts", () => ({
  lookupMergedBasePullRequests: lookup,
}));
registerIterateHooks();

const parent = {
  number: 41,
  url: "https://github.com/owner/repo/pull/41",
  state: "MERGED" as const,
  headRefName: "parent",
  headRefOid: "a".repeat(40),
  baseRefName: "main",
  mergedAt: "2026-10-07T04:44:56Z",
  headRepository: { nameWithOwner: "owner/repo" },
};

function conflictReport() {
  return makeReport({
    baseBranch: "parent",
    baseRefOid: parent.headRefOid,
    status: "FAILING",
    mergeStatus: {
      status: "CONFLICTS",
      state: "OPEN",
      isDraft: false,
      mergeable: "CONFLICTING",
      reviewDecision: null,
      blockingBotReviewInProgress: false,
      mergeStateStatus: "DIRTY",
    },
  });
}

describe("runIterate merged base context", () => {
  it("surfaces matching parent fields and puts conditional retarget guidance first", async () => {
    lookup.mockResolvedValue([parent]);
    mockRunCheck.mockResolvedValue(conflictReport());
    const result = await runIterate(makeOpts());
    expect(lookup).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      baseRefName: "parent",
      baseRefOid: parent.headRefOid,
    });
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") throw new Error("expected fix_code");
    expect(result.mergedBasePullRequests).toEqual([parent]);
    expect(result.fix.instructions[0]).toContain(
      "gh pr edit https://github.com/owner/repo/pull/42",
    );
    expect(result.fix.instructions[0]).toContain("rerun Shepherd immediately");
    expect(result.fix.instructions.join("\n")).toContain("Resolve them before committing");
    const text = formatIterateResult(result);
    expect(text).toContain("## Merged PRs matching the current base\n\n");
    for (const value of Object.values(parent).filter((value) => typeof value === "string")) {
      expect(text).toContain(value);
    }
    expect(text).toContain(parent.headRepository.nameWithOwner);
    const lean = projectIterateLean(result) as {
      mergedBasePullRequests: unknown[];
      fix: { instructions: string[] };
    };
    expect(lean.mergedBasePullRequests).toEqual([parent]);
    expect(text).toContain(`1. ${lean.fix.instructions[0]}`);
  });

  it("retargets through the REST pulls endpoint on the REST transport", async () => {
    lookup.mockResolvedValue([parent]);
    mockRunCheck.mockResolvedValue({ ...conflictReport(), transport: "rest" });
    const result = await runIterate(makeOpts());
    if (result.action !== "fix_code") throw new Error("expected fix_code");
    expect(result.fix.instructions[0]).toContain(
      "gh api --method PATCH repos/owner/repo/pulls/42 -f base=<verified-parent-base>",
    );
    expect(result.fix.instructions.join("\n")).not.toContain("gh pr edit");
  });

  it("skips the lookup outside non-stack conflicts with an exact base OID", async () => {
    lookup.mockClear();
    const report = conflictReport();
    delete report.baseRefOid;
    mockRunCheck.mockResolvedValue(report);
    await runIterate(makeOpts());
    expect(lookup).not.toHaveBeenCalled();
  });

  it("skips a native stack conflict", async () => {
    lookup.mockClear();
    const report = conflictReport();
    report.mergeStatus.mergeRequirements = {
      approvals: { current: 0, requiredCount: 0 },
      conversationsResolved: { resolved: true, unresolvedCount: 0, required: false },
      stack: { number: 9, size: 1, position: 1, baseRefName: "parent" },
    };
    mockRunCheck.mockResolvedValue(report);
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("skips an ordinary nonconflict code fix", async () => {
    lookup.mockClear();
    const report = conflictReport();
    report.mergeStatus.status = "BEHIND";
    report.mergeStatus.mergeable = "MERGEABLE";
    report.mergeStatus.mergeStateStatus = "BEHIND";
    report.checks = {
      ...report.checks,
      failing: [
        {
          name: "tests",
          status: "COMPLETED",
          conclusion: "FAILURE",
          detailsUrl: "https://github.com/owner/repo/actions/runs/123",
          event: "pull_request",
          runId: "123",
          runAttempt: 1,
          workflowName: "CI",
          logExcerpt: "Type error in current source",
          category: "failing",
        },
      ],
    };
    mockRunCheck.mockResolvedValue(report);
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("keeps ordinary conflict instructions when the lookup finds no match", async () => {
    lookup.mockResolvedValue([]);
    mockRunCheck.mockResolvedValue(conflictReport());
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") throw new Error("expected fix_code");
    expect(result.mergedBasePullRequests).toBeUndefined();
    expect(result.fix.instructions.join("\n")).toContain("Resolve them before committing");
    expect(result.fix.instructions.join("\n")).not.toContain("gh pr edit");
    expect(formatIterateResult(result)).not.toContain("## Merged PRs matching the current base");
    expect(projectIterateLean(result)).not.toHaveProperty("mergedBasePullRequests");
  });
});
