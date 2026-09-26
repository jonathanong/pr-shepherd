import { describe, expect, it, vi } from "vitest";
import {
  makeCancelResult,
  makeWaitResult,
  mockRunIterate,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

const SUMMARY = "auto-resolved 1 thread (rule: review-bot suppressed)";

describe("runPoll — classification auto-resolve", () => {
  it("writes the summary on a swallowed quiet WAIT tick", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      mockRunIterate
        .mockResolvedValueOnce(makeWaitResult({ ruleAutoResolve: { summary: SUMMARY } }))
        .mockResolvedValue(makeCancelResult());
      const pollPromise = runPoll({
        prNumber: 42,
        format: "text",
        intervalSeconds: 30,
        timeoutSeconds: 300,
        quietStatus: true,
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(pollPromise).resolves.toMatchObject({ action: "cancel" });
      const written = stderrSpy.mock.calls.map((args) => String(args[0])).join("");
      expect(written).toContain(`${SUMMARY}\n`);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("leaves the summary off stderr when that tick is returned", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      mockRunIterate.mockResolvedValue(makeWaitResult({ ruleAutoResolve: { summary: SUMMARY } }));
      const result = await runPoll({
        prNumber: 42,
        format: "text",
        intervalSeconds: 30,
        timeoutSeconds: 0,
      });
      expect(result.ruleAutoResolve?.summary).toBe(SUMMARY);
      const written = stderrSpy.mock.calls.map((args) => String(args[0])).join("");
      expect(written).not.toContain(SUMMARY);
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
