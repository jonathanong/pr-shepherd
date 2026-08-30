import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import type { ShepherdReport } from "../types.mts";

registerIterateHooks();

// makeReport() defaults viewerAuthorization to full ADMIN access on both the base and
// head repo, so canPushToHead is true unless a test overrides it — matching the common
// case (own-repo or own-fork PR) where pr-shepherd should push and continue autonomously.
const PUSH_DENIED_AUTH = {
  repositoryPermission: "READ" as const,
  viewerCanAdminister: false,
  viewerDidAuthor: true,
  viewerCanUpdate: true,
  viewerCanEnableAutoMerge: false,
  viewerCanEditFiles: false,
  headRepositoryPermission: "READ" as const,
};

const CONFLICT_MERGE_STATUS = {
  status: "CONFLICTS" as const,
  state: "OPEN" as const,
  isDraft: false,
  mergeable: "CONFLICTING" as const,
  reviewDecision: null,
  blockingBotReviewInProgress: false,
  mergeStateStatus: "DIRTY" as const,
};

const THREAD_1 = {
  id: "thread-1",
  isResolved: false,
  isOutdated: false,
  isMinimized: false,
  path: "src/foo.mts",
  line: 10,
  startLine: null,
  author: "reviewer",
  authorType: "User" as const,
  body: "Fix this",
  url: "",
  createdAtUnix: 1700000000,
};

/** A CONFLICTS-status report, optionally with `THREAD_1` as the sole actionable thread. */
function makeConflictReport(overrides: {
  withThread?: boolean;
  viewerAuthorization?: ShepherdReport["viewerAuthorization"];
}): ShepherdReport {
  return makeReport({
    status: "FAILING",
    ...(overrides.viewerAuthorization !== undefined
      ? { viewerAuthorization: overrides.viewerAuthorization }
      : {}),
    mergeStatus: CONFLICT_MERGE_STATUS,
    ...(overrides.withThread
      ? {
          threads: {
            actionable: [THREAD_1],
            resolutionOnly: [],
            autoResolved: [],
            autoResolveErrors: [],
            firstLook: [],
          },
        }
      : {}),
  });
}

async function runConflictIterate(): Promise<ReturnType<typeof runIterate>> {
  mockUpdateReadyDelay.mockResolvedValue({
    isReady: false,
    shouldCancel: false,
    remainingSeconds: 600,
  });
  const result = await runIterate(makeOpts());
  expect(mockUpdateReadyDelay).toHaveBeenCalledWith(42, false, 600, "owner", "repo");
  return result;
}

describe("runIterate — fix_code (merge conflicts)", () => {
  it("resolves conflicts and pushes autonomously when the viewer can push to the PR head", async () => {
    mockRunCheck.mockResolvedValue(makeConflictReport({}));

    const result = await runConflictIterate();

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.threads).toHaveLength(0);
      expect(result.fix.checks).toHaveLength(0);
      // CONFLICTS-only, push authorized: commit + push + continue, no prescriptive git
      // commands beyond that — the agent decides how to resolve.
      const joined = result.fix.instructions.join("\n");
      expect(joined).not.toContain("git commit");
      expect(joined).not.toContain("pr-shepherd apply journal");
      // Conflicts are surfaced by pointing at the `**branch**` state; CLI does not prescribe rebase
      expect(joined).toContain("The branch has merge conflicts (see `**branch**` above)");
      expect(joined).not.toContain("rebase onto");
      // No actual resolve step — no threads/reviews to resolve
      expect(joined).not.toContain("Run the `resolve:` command shown above");
      expect(joined).toContain(
        "Commit any remaining conflict-resolution changes and push to the PR head branch.",
      );
      expect(joined).toContain(
        "`[FIX_CODE]` is non-terminal: resolve the conflicts, commit, push to the PR head branch, then iterate again with the same options.",
      );
      expect(joined).not.toContain("requires a human handoff");
    }
  });

  it("hands off the push after conflict resolution when the viewer cannot push to the PR head", async () => {
    mockRunCheck.mockResolvedValue(makeConflictReport({ viewerAuthorization: PUSH_DENIED_AUTH }));

    const result = await runConflictIterate();

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.threads).toHaveLength(0);
      expect(result.fix.checks).toHaveLength(0);
      const joined = result.fix.instructions.join("\n");
      expect(joined).not.toContain("git commit");
      expect(joined).not.toContain("pr-shepherd apply journal");
      expect(joined).toContain("The branch has merge conflicts (see `**branch**` above)");
      expect(joined).not.toContain("Run the `resolve:` command shown above");
      expect(joined).toContain("Commit any remaining conflict-resolution changes.");
      expect(joined).not.toContain("push to the PR head branch");
      expect(joined).toContain("requires a human handoff for an authorized push");
      expect(joined).not.toContain("iterate again");
    }
  });

  it("resolves conflicts, pushes, and runs review mutations when threads exist and the viewer can push", async () => {
    mockRunCheck.mockResolvedValue(makeConflictReport({ withThread: true }));

    const result = await runConflictIterate();

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.threads).toHaveLength(1);
      expect(result.fix.threads[0]?.id).toBe("thread-1");
      // Push authorized on a conflict tick with threads: mutations are built normally
      // (SHA-gated on the pushed commit), same as any other push-requiring tick.
      expect(result.fix.resolveCommand.hasMutations).toBe(true);
      expect(result.fix.resolveOnlyCommand).toBeUndefined();
      const joined = result.fix.instructions.join("\n");
      expect(joined).not.toContain("git commit");
      expect(joined).toContain("pr-shepherd apply journal"); // shepherd journal
      expect(joined).toContain("The branch has merge conflicts (see `**branch**` above)");
      expect(joined).toContain(
        "Commit any remaining conflict-resolution changes and push to the PR head branch before review mutations.",
      );
      expect(joined).toContain("apply review:");
      expect(joined).toContain(
        "`[FIX_CODE]` is non-terminal: resolve the conflicts, commit, push to the PR head branch, then iterate again with the same options.",
      );
      expect(joined).not.toContain("requires a human handoff");
    }
  });

  it("defers review mutations when CONFLICTS + threads exist and the viewer cannot push", async () => {
    mockRunCheck.mockResolvedValue(
      makeConflictReport({ withThread: true, viewerAuthorization: PUSH_DENIED_AUTH }),
    );

    const result = await runConflictIterate();

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.threads).toHaveLength(1);
      expect(result.fix.threads[0]?.id).toBe("thread-1");
      expect(result.fix.resolveCommand.hasMutations).toBe(false);
      expect(result.fix.resolveOnlyCommand).toBeUndefined();
      // Threads + CONFLICTS, push denied: conditional commit/rebase instruction plus
      // resolve step deferred until an authorized push updates the head.
      const joined = result.fix.instructions.join("\n");
      expect(joined).not.toContain("git commit");
      expect(joined).toContain("pr-shepherd apply journal"); // shepherd journal
      expect(joined).toContain("The branch has merge conflicts (see `**branch**` above)");
      expect(joined).toContain("Commit any remaining conflict-resolution changes.");
      expect(joined).not.toContain("push to the PR head branch");
      expect(joined).not.toContain("apply review:");
      expect(joined).toContain("requires a human handoff for an authorized push");
    }
  });
});
