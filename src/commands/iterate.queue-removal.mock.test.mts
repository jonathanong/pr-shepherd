import { describe, expect, it } from "vitest";
import {
  makeOpts,
  makeReport,
  mockReadQueueRemovalFollowUp,
  mockRunCheck,
  mockUpdateReadyDelay,
  mockWriteQueueRemovalFollowUp,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import { formatIterateResult } from "../cli/iterate-formatter.mts";

registerIterateHooks();

function removedReport(extra: Record<string, unknown> = {}) {
  return makeReport({
    headSha: "abc123",
    mergeQueue: {
      enabled: true,
      inQueue: false,
      latestRemoval: { reason: "MANUAL", actor: "maintainer", createdAtUnix: 1_700_000_000 },
    },
    ...extra,
  });
}

const readyNow = { isReady: true, shouldCancel: true, remainingSeconds: 0 };

describe("runIterate — merge queue removal without a failed queue check", () => {
  it("returns one bounded triage and records the removal", async () => {
    mockRunCheck.mockResolvedValue(removedReport());
    mockUpdateReadyDelay.mockResolvedValue(readyNow);

    const result = await runIterate(makeOpts({ merge: true }));
    expect(result.action).toBe("triage");
    expect(mockWriteQueueRemovalFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({ pr: 42 }),
      "abc123#1700000000#",
    );
    const text = formatIterateResult(result);
    expect(text).toContain('Playbook: "Merge queue ejection"');
    expect(text).toContain("Never enqueue the PR yourself");
  });

  it("does not record the removal on a debounce preview tick", async () => {
    mockRunCheck.mockResolvedValue(removedReport());
    mockUpdateReadyDelay.mockResolvedValue(readyNow);

    const result = await runIterate(makeOpts({ merge: true, persistSeen: false }));
    expect(result.action).toBe("triage");
    expect(mockWriteQueueRemovalFollowUp).not.toHaveBeenCalled();
  });

  it("does not record the removal on a reused cached report the poll will refresh", async () => {
    mockRunCheck.mockResolvedValue(removedReport({ fingerprintReused: true }));
    mockUpdateReadyDelay.mockResolvedValue(readyNow);

    const result = await runIterate(makeOpts({ merge: true }));
    expect(result.action).toBe("triage");
    expect(mockWriteQueueRemovalFollowUp).not.toHaveBeenCalled();
  });

  it("escalates when the investigation marker cannot be saved", async () => {
    mockRunCheck.mockResolvedValue(removedReport());
    mockUpdateReadyDelay.mockResolvedValue(readyNow);
    mockWriteQueueRemovalFollowUp.mockResolvedValue("queue-removal-follow-up.json: EACCES");

    const result = await runIterate(makeOpts({ merge: true }));
    expect(result.action).toBe("escalate");
    if (result.action !== "escalate") return;
    expect(result.escalate.triggers).toEqual(["stall-state-unavailable"]);
    expect(result.escalate.suggestion).toContain("queue-removal-follow-up.json: EACCES");
  });

  it("escalates once the same removal is unchanged after the investigation tick", async () => {
    mockRunCheck.mockResolvedValue(removedReport());
    mockUpdateReadyDelay.mockResolvedValue(readyNow);
    mockReadQueueRemovalFollowUp.mockResolvedValue(true);

    const result = await runIterate(makeOpts({ merge: true }));
    expect(result.action).toBe("escalate");
    if (result.action !== "escalate") return;
    expect(result.escalate.mergeQueueRemoval?.reason).toBe("MANUAL");
    expect(result.escalate.suggestion).toContain("unchanged after one investigation tick");
    expect(result.escalate.humanMessage).toContain(
      "pr-shepherd https://github.com/owner/repo/pull/42 --merge",
    );
    expect(mockWriteQueueRemovalFollowUp).not.toHaveBeenCalled();
  });

  it("names the stack update route on a native stack", async () => {
    mockRunCheck.mockResolvedValue(
      removedReport({
        mergeStatus: {
          ...makeReport().mergeStatus,
          mergeRequirements: {
            approvals: { current: 0, requiredCount: 0 },
            conversationsResolved: { resolved: true, unresolvedCount: 0, required: false },
            stack: { number: 7, size: 2, position: 2, baseRefName: "main" },
          },
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue(readyNow);

    const result = await runIterate(makeOpts({ merge: true }));
    expect(result.action).toBe("triage");
    expect(formatIterateResult(result)).toContain("update the stack from the latest base");
  });

  it("works without a reason or head SHA", async () => {
    const report = removedReport();
    delete report.headSha;
    report.mergeQueue!.latestRemoval = { reason: null, createdAtUnix: 1 };
    mockRunCheck.mockResolvedValue(report);
    mockUpdateReadyDelay.mockResolvedValue(readyNow);
    mockReadQueueRemovalFollowUp.mockResolvedValue(true);

    const result = await runIterate(makeOpts({ merge: true }));
    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.suggestion).toContain("GitHub did not provide a reason");
    }
  });
});
