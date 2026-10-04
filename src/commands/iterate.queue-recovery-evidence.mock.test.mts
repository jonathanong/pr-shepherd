import { describe, expect, it } from "vitest";
import {
  makeOpts,
  makeReport,
  mockRunCheck,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("queue recovery evidence", () => {
  it("offers local stack acknowledgment for aggregate child sessions without --merge", async () => {
    const report = removedEntryReport("OpenRouter HTTP 529");
    report.mergeStatus.mergeRequirements = {
      approvals: { current: 0, requiredCount: 0 },
      conversationsResolved: { resolved: true, unresolvedCount: 0, required: false },
      stack: { number: 7, size: 1, position: 1, baseRefName: "main" },
    };
    mockRunCheck.mockResolvedValue(report);

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.queueRemovalAcknowledgment?.argv).toEqual([
      "pr-shepherd",
      "apply",
      "queue-removal",
      "https://github.com/owner/repo/pull/42",
      "--require-sha",
      "abc123",
      "--queue-commit",
      "queue-commit",
      "--removed-at",
      "1700000000",
    ]);
    expect(result.fix.requeue).toBeUndefined();
  });

  it.each([false, true])(
    "accepts an external check URL as recovery evidence (stack: %s)",
    async (stack) => {
      const report = removedEntryReport();
      const check = report.checks.failing[0]!;
      check.runId = null;
      check.workflowName = undefined;
      check.logExcerpt = undefined;
      check.detailsUrl = "https://ci.example/jobs/123";
      if (stack)
        report.mergeStatus.mergeRequirements = {
          approvals: { current: 0, requiredCount: 0 },
          conversationsResolved: { resolved: true, unresolvedCount: 0, required: false },
          stack: { number: 7, size: 1, position: 1, baseRefName: "main" },
        };
      mockRunCheck.mockResolvedValue(report);

      const result = await runIterate(makeOpts({ merge: true }));

      expect(result.action).toBe("fix_code");
      if (result.action !== "fix_code") return;
      if (stack) {
        expect(result.fix.queueRemovalAcknowledgment).toBeDefined();
        expect(result.fix.requeue).toBeUndefined();
      } else {
        expect(result.fix.requeue).toBeDefined();
        expect(result.fix.queueRemovalAcknowledgment).toBeUndefined();
      }
    },
  );

  it.each([false, true])(
    "denies an external check without a URL or log evidence (stack: %s)",
    async (stack) => {
      const report = removedEntryReport();
      const check = report.checks.failing[0]!;
      check.runId = null;
      check.workflowName = undefined;
      check.logExcerpt = undefined;
      check.detailsUrl = "";
      if (stack)
        report.mergeStatus.mergeRequirements = {
          approvals: { current: 0, requiredCount: 0 },
          conversationsResolved: { resolved: true, unresolvedCount: 0, required: false },
          stack: { number: 7, size: 1, position: 1, baseRefName: "main" },
        };
      mockRunCheck.mockResolvedValue(report);

      const result = await runIterate(makeOpts({ merge: true }));

      expect(result.action).toBe("escalate");
      if (result.action !== "escalate") return;
      expect(result.escalate.triggers).toContain("check-follow-up-unavailable");
    },
  );

  it.each([false, true])(
    "does not offer no-evidence recovery alongside review work (stack: %s)",
    async (stack) => {
      const report = removedEntryReport();
      report.comments.actionable = [
        {
          id: "comment-1",
          author: "reviewer",
          authorType: "Bot",
          body: "Please inspect the implementation",
          isMinimized: false,
          createdAtUnix: 1_700_000_000,
          url: "https://github.com/owner/repo/pull/42#issuecomment-1",
        },
      ];
      if (stack)
        report.mergeStatus.mergeRequirements = {
          approvals: { current: 0, requiredCount: 0 },
          conversationsResolved: { resolved: true, unresolvedCount: 0, required: false },
          stack: { number: 7, size: 1, position: 1, baseRefName: "main" },
        };
      mockRunCheck.mockResolvedValue(report);
      const result = await runIterate(makeOpts({ merge: true }));
      expect(result.action).toBe("fix_code");
      if (result.action !== "fix_code") return;
      expect(result.fix.requeue).toBeUndefined();
      expect(result.fix.queueRemovalAcknowledgment).toBeUndefined();
    },
  );
});

function removedEntryReport(logExcerpt?: string) {
  return makeReport({
    status: "FAILING",
    headSha: "abc123",
    mergeQueue: {
      enabled: true,
      inQueue: false,
      latestRemoval: {
        reason: "CI_FAILURE",
        createdAtUnix: 1_700_000_000,
        beforeCommitOid: "queue-commit",
      },
    },
    checks: {
      passing: [],
      failing: [
        {
          name: "tests",
          status: "COMPLETED",
          conclusion: "FAILURE",
          detailsUrl: "https://github.com/owner/repo/actions/runs/123",
          event: "merge_group",
          runId: "123",
          runAttempt: 1,
          workflowName: "CI",
          category: "failing",
          scope: "merge_group",
          commitOid: "queue-commit",
          logExcerpt,
        },
      ],
      inProgress: [],
      skipped: [],
      filtered: [],
      filteredNames: [],
      blockedByFilteredCheck: false,
    },
  });
}
