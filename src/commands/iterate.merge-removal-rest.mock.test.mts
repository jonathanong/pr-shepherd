import { describe, expect, it } from "vitest";
import {
  makeOpts,
  makeReport,
  mockRunCheck,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import { formatIterateResult } from "../cli/iterate-formatter.mts";
import { projectIterateLean } from "../cli/iterate-lean.mts";
import { runWithGithubTransport } from "../github/transport.mts";

registerIterateHooks();

describe("REST merge-queue recovery evidence", () => {
  it.each(["rest-snapshot", "fallback-after-snapshot"])(
    "surfaces unsupported recovery without a REST requeue for %s",
    async (state) => {
      const report = removedEntryReport("OpenRouter HTTP 529");
      if (state === "rest-snapshot") report.transport = "rest";
      mockRunCheck.mockResolvedValue(report);
      const result = await runWithGithubTransport(
        state === "rest-snapshot" ? "graphql" : "rest",
        () => runIterate(makeOpts({ merge: true })),
      );
      expect(result.action).toBe("fix_code");
      if (result.action !== "fix_code") return;
      expect(result.fix.requeue).toBeUndefined();
      expect(result.fix.checks[0]?.logExcerpt).toBe("OpenRouter HTTP 529");
      const instruction = result.fix.instructions.find((step) =>
        step.includes("transport-unsupported"),
      );
      expect(instruction).toContain("REST cannot verify current merge-queue removal");
      expect(formatIterateResult(result)).toContain(instruction);
      expect(projectIterateLean(result)).toMatchObject({
        fix: { instructions: expect.arrayContaining([instruction]) },
      });
      expect(formatIterateResult(result)).not.toContain("- requeue:");
    },
  );

  it.each([
    ["rest-snapshot", false],
    ["rest-snapshot", true],
    ["fallback-after-snapshot", false],
    ["fallback-after-snapshot", true],
  ] as const)(
    "surfaces unsupported stack acknowledgment for %s (merge: %s)",
    async (state, merge) => {
      const report = removedEntryReport("OpenRouter HTTP 529");
      if (state === "rest-snapshot") report.transport = "rest";
      report.mergeStatus.mergeRequirements = {
        approvals: { current: 0, requiredCount: 0 },
        conversationsResolved: { resolved: true, unresolvedCount: 0, required: false },
        stack: { number: 7, size: 2, position: 2, baseRefName: "main" },
      };
      mockRunCheck.mockResolvedValue(report);
      const result = await runWithGithubTransport(
        state === "rest-snapshot" ? "graphql" : "rest",
        () => runIterate(makeOpts({ merge })),
      );
      expect(result.action).toBe("fix_code");
      if (result.action !== "fix_code") return;
      expect(result.fix.requeue).toBeUndefined();
      expect(result.fix.queueRemovalAcknowledgment).toBeUndefined();
      const instruction = result.fix.instructions.find((step) =>
        step.includes("transport-unsupported"),
      );
      expect(instruction).toContain("removal acknowledgment require verified current removal");
      expect(formatIterateResult(result)).toContain(instruction);
      expect(projectIterateLean(result)).toMatchObject({
        fix: { instructions: expect.arrayContaining([instruction]) },
      });
      expect(formatIterateResult(result)).not.toContain("- acknowledge queue removal:");
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
        reason: "failed_checks",
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
