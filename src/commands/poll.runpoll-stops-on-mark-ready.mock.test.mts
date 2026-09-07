import { describe, it, expect } from "vitest";
import {
  mockRunIterate,
  makeMarkReadyResult,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

describe("runPoll — stops on mark_ready", () => {
  it("returns the mark_ready result immediately without sleeping", async () => {
    mockRunIterate.mockResolvedValue(makeMarkReadyResult());

    const result = await runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 300,
    });

    expect(result.action).toBe("mark_ready");
    expect(mockRunIterate).toHaveBeenCalledTimes(1);
  });
});
