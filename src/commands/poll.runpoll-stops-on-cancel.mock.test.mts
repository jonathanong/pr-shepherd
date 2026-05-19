import { describe, it, expect } from "vitest";
import { mockRunIterate, makeCancelResult, registerPollHooks } from "./poll.test-support.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

describe("runPoll — stops on cancel", () => {
  it("returns the cancel result immediately without sleeping", async () => {
    mockRunIterate.mockResolvedValue(makeCancelResult());

    const result = await runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 300,
    });

    expect(result.action).toBe("cancel");
    expect(mockRunIterate).toHaveBeenCalledTimes(1);
  });
});
