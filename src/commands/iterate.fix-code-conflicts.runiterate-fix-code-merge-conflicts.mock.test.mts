import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("runIterate — fix_code (merge conflicts)", () => {
  it("returns action: fix_code when mergeStatus is CONFLICTS (rebase happens in fix_code handler)", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        mergeStatus: {
          status: "CONFLICTS",
          state: "OPEN" as const,
          isDraft: false,
          mergeable: "CONFLICTING",
          reviewDecision: null,
          blockingBotReviewInProgress: false,
          mergeStateStatus: "DIRTY",
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(mockUpdateReadyDelay).toHaveBeenCalledWith(42, false, 600, "owner", "repo");
    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.threads).toHaveLength(0);
      expect(result.fix.checks).toHaveLength(0);
      // CONFLICTS-only: conditional commit/rebase instruction (agent decides),
      // no prescriptive git commands, and no resolve step (nothing to resolve).
      const joined = result.fix.instructions.join("\n");
      expect(joined).not.toContain("git commit");
      expect(joined).not.toContain("gh pr edit");
      expect(joined).not.toContain("pr-shepherd apply journal");
      // Conflicts are surfaced by pointing at the `**branch**` state; CLI does not prescribe rebase
      expect(joined).toContain("The branch has merge conflicts (see `**branch**` above)");
      expect(joined).not.toContain("rebase onto");
      expect(joined).not.toContain("origin/main");
      expect(joined).not.toContain("git rebase --continue");
      // No actual resolve step — no threads/reviews to resolve
      expect(joined).not.toContain("Run the `resolve:` command shown above");
      expect(joined).toContain("requires a push after conflict resolution");
    }
  });

  it("returns fix_code with threads when CONFLICTS + actionable comments exist (one push)", async () => {
    const thread = {
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
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        mergeStatus: {
          status: "CONFLICTS",
          state: "OPEN" as const,
          isDraft: false,
          mergeable: "CONFLICTING",
          reviewDecision: null,
          blockingBotReviewInProgress: false,
          mergeStateStatus: "DIRTY",
        },
        threads: {
          actionable: [thread],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(mockUpdateReadyDelay).toHaveBeenCalledWith(42, false, 600, "owner", "repo");
    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.threads).toHaveLength(1);
      expect(result.fix.threads[0]?.id).toBe("thread-1");
      expect(result.fix.resolveCommand.hasMutations).toBe(false);
      expect(result.fix.resolveOnlyCommand).toBeUndefined();
      // Threads + CONFLICTS: conditional commit/rebase instruction plus resolve step.
      // No prescriptive git commands — agent decides based on conditional phrasing.
      const joined = result.fix.instructions.join("\n");
      expect(joined).not.toContain("git commit");
      expect(joined).toContain("pr-shepherd apply journal"); // shepherd journal
      expect(joined).toContain("The branch has merge conflicts (see `**branch**` above)");
      expect(joined).toContain("Commit any remaining conflict-resolution changes.");
      expect(joined).not.toContain("rebase onto");
      expect(joined).not.toContain("origin/main");
      expect(joined).not.toContain("git rebase --continue");
      expect(joined).not.toMatch(/rebase origin\/\w+ && git push/);
      expect(joined).not.toContain("apply review:");
      expect(joined).toContain("requires a push after conflict resolution");
    }
  });
});
