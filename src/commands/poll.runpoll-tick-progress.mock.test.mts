import { describe, it, expect, vi } from "vitest";
import {
  mockRunIterate,
  makeWaitResult,
  makeCancelResult,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

type SpyCalls = { mock: { calls: unknown[][] } };

function withStderrTTY(isTTY: boolean, fn: (spy: SpyCalls) => Promise<void>): () => Promise<void> {
  return async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
    Object.defineProperty(process.stderr, "isTTY", { value: isTTY, configurable: true });
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      await fn(spy as unknown as SpyCalls);
    } finally {
      spy.mockRestore();
      if (originalDescriptor) {
        Object.defineProperty(process.stderr, "isTTY", originalDescriptor);
      } else {
        delete (process.stderr as { isTTY?: boolean }).isTTY;
      }
    }
  };
}

describe("runPoll — tick progress logging", () => {
  it(
    "writes an explicit liveness line per WAIT tick to stderr (non-TTY, non-verbose)",
    withStderrTTY(false, async (stderrSpy) => {
      mockRunIterate
        .mockResolvedValueOnce(makeWaitResult())
        .mockResolvedValueOnce(makeWaitResult())
        .mockResolvedValue(makeCancelResult());

      const pollPromise = runPoll({
        prNumber: 42,
        format: "text",
        intervalSeconds: 30,
        timeoutSeconds: 300,
      });

      await vi.advanceTimersByTimeAsync(60_000);
      await pollPromise;

      const written = stderrSpy.mock.calls.map((args) => String(args[0])).join("");
      expect(written).toBe(
        "[poll tick 1 / +0s] WAIT — 2 passing, 1 in-progress; next tick in 30s\n" +
          "[poll tick 2 / +30s] WAIT — 2 passing, 1 in-progress; next tick in 30s\n",
      );
    }),
  );

  it(
    "writes explicit liveness even when stderr is a TTY (non-verbose)",
    withStderrTTY(true, async (stderrSpy) => {
      mockRunIterate.mockResolvedValueOnce(makeWaitResult()).mockResolvedValue(makeCancelResult());

      const pollPromise = runPoll({
        prNumber: 42,
        format: "text",
        intervalSeconds: 30,
        timeoutSeconds: 300,
      });

      await vi.advanceTimersByTimeAsync(30_000);
      await pollPromise;

      const written = stderrSpy.mock.calls.map((args) => String(args[0])).join("");
      expect(written).toBe(
        "[poll tick 1 / +0s] WAIT — 2 passing, 1 in-progress; next tick in 30s\n",
      );
    }),
  );

  it(
    "writes detailed per-tick line when verbose:true",
    withStderrTTY(false, async (stderrSpy) => {
      mockRunIterate.mockResolvedValueOnce(makeWaitResult()).mockResolvedValue(makeCancelResult());

      const pollPromise = runPoll({
        prNumber: 42,
        format: "text",
        verbose: true,
        intervalSeconds: 30,
        timeoutSeconds: 300,
      });

      await vi.advanceTimersByTimeAsync(30_000);
      await pollPromise;

      const written = stderrSpy.mock.calls.map((args) => String(args[0])).join("");
      expect(written).toContain(
        "[poll tick 1 / +0s] WAIT — 2 passing, 1 in-progress — sleeping 30s\n",
      );
    }),
  );

  it(
    "names the reason the tick is waiting",
    withStderrTTY(false, async (stderrSpy) => {
      mockRunIterate
        .mockResolvedValueOnce(
          makeWaitResult({ log: "WAIT: 3 passing, 0 in-progress — PR is a draft" }),
        )
        .mockResolvedValue(makeCancelResult());

      const pollPromise = runPoll({
        prNumber: 42,
        format: "text",
        intervalSeconds: 30,
        timeoutSeconds: 300,
      });

      await vi.advanceTimersByTimeAsync(30_000);
      await pollPromise;

      const written = stderrSpy.mock.calls.map((args) => String(args[0])).join("");
      expect(written).toBe(
        "[poll tick 1 / +0s] WAIT — 3 passing, 0 in-progress — PR is a draft; next tick in 30s\n",
      );
    }),
  );

  it(
    "terminates each liveness line with a newline",
    withStderrTTY(false, async (stderrSpy) => {
      mockRunIterate.mockResolvedValueOnce(makeWaitResult()).mockResolvedValue(makeCancelResult());

      const pollPromise = runPoll({
        prNumber: 42,
        format: "text",
        intervalSeconds: 30,
        timeoutSeconds: 300,
      });

      await vi.advanceTimersByTimeAsync(30_000);
      await pollPromise;

      const lastWrite = String(stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1]?.[0] ?? "");
      expect(lastWrite).toBe(
        "[poll tick 1 / +0s] WAIT — 2 passing, 1 in-progress; next tick in 30s\n",
      );
    }),
  );

  it(
    "returns WAIT on timeout without --until-terminal",
    withStderrTTY(false, async () => {
      mockRunIterate.mockResolvedValue(makeWaitResult());

      const result = await runPoll({
        prNumber: 42,
        format: "text",
        intervalSeconds: 30,
        timeoutSeconds: 1,
      });

      expect(mockRunIterate).toHaveBeenCalledTimes(1);
      expect(result.action).toBe("wait");
    }),
  );
});
