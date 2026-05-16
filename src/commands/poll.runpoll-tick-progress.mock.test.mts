// @ts-nocheck
import { describe, it, expect, vi } from "vitest";
import {
  mockRunIterate,
  makeWaitResult,
  makeCancelResult,
  registerPollHooks,
} from "./poll.test-support.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

describe("runPoll — tick progress logging", () => {
  it("writes progress to stderr on TTY when looping", async () => {
    const originalIsTTY = process.stderr.isTTY;
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    mockRunIterate.mockResolvedValueOnce(makeWaitResult()).mockResolvedValue(makeCancelResult());

    const pollPromise = runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 300,
    });

    await vi.advanceTimersByTimeAsync(30_000);
    await pollPromise;

    expect(stderrSpy.mock.calls.some((args) => String(args[0]).includes("[poll tick"))).toBe(true);

    stderrSpy.mockRestore();
    Object.defineProperty(process.stderr, "isTTY", { value: originalIsTTY, configurable: true });
  });

  it("writes progress when verbose:true even on non-TTY", async () => {
    const originalIsTTY = process.stderr.isTTY;
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

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

    expect(stderrSpy.mock.calls.some((args) => String(args[0]).includes("[poll tick"))).toBe(true);

    stderrSpy.mockRestore();
    Object.defineProperty(process.stderr, "isTTY", { value: originalIsTTY, configurable: true });
  });
});
