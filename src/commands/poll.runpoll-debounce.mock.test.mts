import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mockRunIterate,
  makeWaitResult,
  makeCancelResult,
  makeFixCodeResult,
  makeEscalateResult,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

function pollOpts(
  overrides: {
    intervalSeconds?: number;
    timeoutSeconds?: number;
    debounceSeconds?: number;
  } = {},
) {
  return {
    prNumber: 42,
    format: "text" as const,
    intervalSeconds: 30,
    timeoutSeconds: 300,
    ...overrides,
  };
}

function persistSeenAt(index: number): boolean | undefined {
  const arg = mockRunIterate.mock.calls[index]?.[0] as { persistSeen?: boolean } | undefined;
  return arg?.persistSeen;
}

describe("runPoll — FIX_CODE debounce", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it("defaults to a 60s window: first FIX_CODE is not returned until a later persist tick", async () => {
    mockRunIterate.mockResolvedValue(makeFixCodeResult());

    const pollPromise = runPoll(pollOpts({ intervalSeconds: 60 }));
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pollPromise;

    expect(result.action).toBe("fix_code");
    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    expect(persistSeenAt(0)).toBe(false);
    expect(persistSeenAt(1)).toBe(true);
  });

  it("keeps polling at --interval during a 5m debounce window", async () => {
    mockRunIterate.mockResolvedValue(makeFixCodeResult());
    const pollPromise = runPoll(pollOpts({ intervalSeconds: 60, debounceSeconds: 300 }));
    for (let i = 0; i < 5; i += 1) await vi.advanceTimersByTimeAsync(60_000);
    const result = await pollPromise;

    expect(result.action).toBe("fix_code");
    expect(mockRunIterate).toHaveBeenCalledTimes(6);
    for (let i = 0; i < 5; i += 1) expect(persistSeenAt(i)).toBe(false);
    expect(persistSeenAt(5)).toBe(true);
  });

  it("returns the first FIX_CODE immediately when debounce is 0", async () => {
    mockRunIterate.mockResolvedValue(makeFixCodeResult());
    const result = await runPoll(pollOpts({ debounceSeconds: 0 }));

    expect(result.action).toBe("fix_code");
    expect(mockRunIterate).toHaveBeenCalledTimes(1);
    expect(persistSeenAt(0)).toBe(true);
  });

  it("returns CANCEL immediately during the debounce window", async () => {
    mockRunIterate.mockResolvedValueOnce(makeFixCodeResult()).mockResolvedValue(makeCancelResult());
    const pollPromise = runPoll(pollOpts({ debounceSeconds: 60 }));
    await vi.advanceTimersByTimeAsync(30_000);

    expect((await pollPromise).action).toBe("cancel");
    expect(mockRunIterate).toHaveBeenCalledTimes(2);
  });

  it("returns ESCALATE immediately during the debounce window", async () => {
    mockRunIterate
      .mockResolvedValueOnce(makeFixCodeResult())
      .mockResolvedValue(makeEscalateResult());
    const pollPromise = runPoll(pollOpts({ debounceSeconds: 60 }));
    await vi.advanceTimersByTimeAsync(30_000);

    expect((await pollPromise).action).toBe("escalate");
    expect(mockRunIterate).toHaveBeenCalledTimes(2);
  });

  it("clears debounce and resumes WAIT polling when work disappears", async () => {
    mockRunIterate
      .mockResolvedValueOnce(makeFixCodeResult())
      .mockResolvedValueOnce(makeWaitResult())
      .mockResolvedValue(makeCancelResult());
    const pollPromise = runPoll(pollOpts({ debounceSeconds: 60 }));
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);

    expect((await pollPromise).action).toBe("cancel");
    expect(mockRunIterate).toHaveBeenCalledTimes(3);
  });

  it("does not let --timeout cut an in-flight debounce short", async () => {
    mockRunIterate.mockResolvedValue(makeFixCodeResult());
    const pollPromise = runPoll(pollOpts({ timeoutSeconds: 1, debounceSeconds: 60 }));
    await vi.advanceTimersByTimeAsync(60_000);

    expect((await pollPromise).action).toBe("fix_code");
    expect(mockRunIterate).toHaveBeenCalledTimes(3);
    expect(persistSeenAt(2)).toBe(true);
  });

  it("sleeps min(interval, remaining) for the last debounce slice", async () => {
    mockRunIterate.mockResolvedValue(makeFixCodeResult());
    const pollPromise = runPoll(
      pollOpts({ intervalSeconds: 60, timeoutSeconds: 300, debounceSeconds: 90 }),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(30_000);

    expect((await pollPromise).action).toBe("fix_code");
    expect(mockRunIterate).toHaveBeenCalledTimes(3);
    expect(persistSeenAt(2)).toBe(true);
  });

  it("returns the post-debounce WAIT instead of re-entering the WAIT loop", async () => {
    mockRunIterate.mockResolvedValueOnce(makeFixCodeResult()).mockResolvedValue(makeWaitResult());
    const pollPromise = runPoll(pollOpts({ intervalSeconds: 60, debounceSeconds: 60 }));
    await vi.advanceTimersByTimeAsync(60_000);

    expect((await pollPromise).action).toBe("wait");
    expect(mockRunIterate).toHaveBeenCalledTimes(2);
  });

  it("persists seen when a FIX_CODE iterate starts before debounceUntil and finishes after", async () => {
    mockRunIterate.mockImplementation(async () => {
      if (mockRunIterate.mock.calls.length === 2) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      return makeFixCodeResult();
    });

    const pollPromise = runPoll(pollOpts({ intervalSeconds: 4, debounceSeconds: 5 }));
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await pollPromise;

    expect(result.action).toBe("fix_code");
    expect(mockRunIterate).toHaveBeenCalledTimes(3);
    expect(persistSeenAt(0)).toBe(false);
    expect(persistSeenAt(1)).toBe(false);
    expect(persistSeenAt(2)).toBe(true);
  });

  it("writes a newline before debounce progress when WAIT dots were printed", async () => {
    mockRunIterate.mockResolvedValueOnce(makeWaitResult()).mockResolvedValue(makeFixCodeResult());
    const pollPromise = runPoll(pollOpts({ intervalSeconds: 30, debounceSeconds: 60 }));
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(60_000);
    await pollPromise;
    expect(stderrSpy.mock.calls.map((args: unknown[]) => String(args[0])).join("")).toContain(
      ".\n[poll tick 2 / +30s] FIX_CODE — debounce 60s remaining\n",
    );
  });

  it("writes a debounce remaining line to stderr", async () => {
    mockRunIterate.mockResolvedValue(makeFixCodeResult());
    const pollPromise = runPoll(pollOpts({ intervalSeconds: 60, debounceSeconds: 60 }));
    await vi.advanceTimersByTimeAsync(60_000);
    await pollPromise;
    expect(stderrSpy.mock.calls.map((args: unknown[]) => String(args[0])).join("")).toContain(
      "FIX_CODE — debounce 60s remaining",
    );
  });
});
