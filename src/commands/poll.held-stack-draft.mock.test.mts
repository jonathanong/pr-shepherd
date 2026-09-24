import { describe, it, expect, vi } from "vitest";
import {
  mockRunIterate,
  makeWaitResult,
  makeCancelResult,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { runPoll } from "./poll.mts";
import type { IterateResult, StackDraftHold } from "../types.mts";

registerPollHooks();

const heldByLowerLayer: StackDraftHold = {
  kind: "lower-layer-not-ready",
  lowerLayer: { pr: 41, reason: "no-ready-receipt" },
};

function heldWait(stackDraftHold: StackDraftHold): IterateResult {
  return makeWaitResult({ stackDraftHold } as Partial<IterateResult>);
}

describe("runPoll — held native stack drafts", () => {
  it.each([
    ["until-terminal", { untilTerminal: true }],
    ["bounded", {}],
  ])("hands a draft held by a named lower layer back after one %s tick", async (_mode, mode) => {
    mockRunIterate.mockResolvedValue(heldWait(heldByLowerLayer));

    const result = await runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 300,
      ...mode,
    });

    expect(result).toMatchObject({ action: "wait", stackDraftHold: heldByLowerLayer });
    expect(mockRunIterate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an unverifiable lower stack", { kind: "lower-layer-not-ready" }],
    ["a session without automatic mark-ready", { kind: "auto-mark-ready-disabled" }],
  ] as [string, StackDraftHold][])("keeps polling a draft held by %s", async (_case, hold) => {
    mockRunIterate.mockResolvedValueOnce(heldWait(hold)).mockResolvedValue(makeCancelResult());

    const pollPromise = runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 300,
      untilTerminal: true,
    });
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(pollPromise).resolves.toMatchObject({ action: "cancel" });
    expect(mockRunIterate).toHaveBeenCalledTimes(2);
  });
});
