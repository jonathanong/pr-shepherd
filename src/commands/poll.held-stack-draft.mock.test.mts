import { describe, it, expect } from "vitest";
import {
  mockRunIterate,
  makeCancelResult,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

describe("runPoll — automatic mark-ready disabled", () => {
  it("returns a clean draft stop immediately without another poll", async () => {
    mockRunIterate.mockResolvedValue({
      ...makeCancelResult(),
      action: "cancel",
      reason: "auto-mark-ready-disabled",
      log: "CANCEL: automatic mark-ready disabled",
      isDraft: true,
    });

    await expect(
      runPoll({
        prNumber: 42,
        format: "text",
        intervalSeconds: 30,
        timeoutSeconds: 300,
        untilTerminal: true,
      }),
    ).resolves.toMatchObject({ action: "cancel", reason: "auto-mark-ready-disabled" });
    expect(mockRunIterate).toHaveBeenCalledTimes(1);
  });
});
