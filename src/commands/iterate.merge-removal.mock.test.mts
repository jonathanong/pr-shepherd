import { describe, expect, it } from "vitest";
import {
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import { formatIterateResult } from "../cli/iterate-formatter.mts";

registerIterateHooks();

describe("runIterate — merge queue removal", () => {
  it.each([false, true])(
    "preserves failed queue evidence without a rerun (merge: %s)",
    async (merge) => {
      mockRunCheck.mockResolvedValue(removedEntryReport("OpenRouter HTTP 529"));

      const result = await runIterate(makeOpts({ merge }));
      expect(result.action).toBe("fix_code");
      if (result.action !== "fix_code") return;
      expect(result.fix.checks[0]).toMatchObject({
        scope: "merge_group",
        commitOid: "queue-commit",
        logExcerpt: "OpenRouter HTTP 529",
      });
      expect(result.fix.checks[0]?.rerunCommand).toBeUndefined();
      const text = formatIterateResult(result);
      expect(text).toContain("OpenRouter HTTP 529");
      expect(text).toContain("merge_group");
      expect(text).not.toContain("[rerun authorized]");
      expect(text).not.toContain("rerun:");
    },
  );

  it("escalates a removed queue check without usable log evidence", async () => {
    mockRunCheck.mockResolvedValue(removedEntryReport());

    const result = await runIterate(makeOpts({ merge: true }));
    expect(result.action).toBe("escalate");
    if (result.action !== "escalate") return;
    expect(result.escalate.triggers).toContain("check-follow-up-unavailable");
    expect(result.escalate.checks?.[0]).toMatchObject({ scope: "merge_group" });
    expect(result.escalate.checks?.[0]?.rerunCommand).toBeUndefined();
    const text = formatIterateResult(result);
    expect(text).not.toContain("[rerun authorized]");
    expect(text).not.toContain("rerun:");
  });

  it("marks an eligible draft ready before an elapsed-delay merge", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        mergeStatus: {
          status: "DRAFT",
          state: "OPEN",
          isDraft: true,
          mergeable: "MERGEABLE",
          reviewDecision: "APPROVED",
          blockingBotReviewInProgress: false,
          mergeStateStatus: "CLEAN",
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts({ merge: true }));
    expect(result.action).toBe("mark_ready");
  });

  it("escalates a current ejection before a ready-delay merge", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        mergeQueue: {
          enabled: true,
          inQueue: false,
          latestRemoval: { reason: "MANUAL", createdAtUnix: 1_700_000_000 },
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts({ merge: true }));
    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.mergeQueueRemoval?.reason).toBe("MANUAL");
      expect(result.escalate.humanMessage).toContain(
        "pr-shepherd https://github.com/owner/repo/pull/42 --merge",
      );
    }
  });
});

function removedEntryReport(logExcerpt?: string) {
  return makeReport({
    status: "FAILING",
    mergeQueue: {
      enabled: true,
      inQueue: false,
      latestRemoval: { reason: "CI_FAILURE", createdAtUnix: 1_700_000_000 },
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
