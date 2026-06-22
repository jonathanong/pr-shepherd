import { describe, it, expect, vi } from "vitest";
import {
  mockRunIterate,
  makeWaitResult,
  makeCancelResult,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

describe("runPoll — quiet status", () => {
  it("writes only changed WAIT snapshots with active checks", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      mockRunIterate
        .mockResolvedValueOnce(waitWithActivity(1, 1, ["CI"]))
        .mockResolvedValueOnce(waitWithActivity(1, 1, ["CI"]))
        .mockResolvedValueOnce(waitWithActivity(2, 1, ["CI"]))
        .mockResolvedValueOnce(waitWithActivity(2, 2, ["CI", "lint"]))
        .mockResolvedValue(makeCancelResult());

      const pollPromise = runPoll({
        prNumber: 42,
        format: "text",
        intervalSeconds: 30,
        timeoutSeconds: 300,
        quietStatus: true,
      });

      await vi.advanceTimersByTimeAsync(120_000);
      await pollPromise;

      const written = stderrSpy.mock.calls.map((args) => String(args[0])).join("");
      expect(written.match(/\[poll tick/g)).toHaveLength(3);
      expect(written).toContain("active: CI (IN_PROGRESS)");
      expect(written).toContain("lint (QUEUED)");
      expect(written).toContain("2 commits");
      expect(written).toContain("2 review rounds");
      expect(written).not.toContain(".");
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

function waitWithActivity(commitCount: number, reviewRoundCount: number, names: string[]) {
  return makeWaitResult({
    activity: {
      commitCount,
      reviewRoundCount,
      latestCommitCommittedAtUnix: 1_700_000_000 + commitCount * 30,
      reviewItemsSinceLatestCommit: [],
    },
    inProgressChecks: names.map((name, i) => ({
      name,
      status: i === 0 ? ("IN_PROGRESS" as const) : ("QUEUED" as const),
      runId: String(123 + i),
      detailsUrl: null,
    })),
  });
}
