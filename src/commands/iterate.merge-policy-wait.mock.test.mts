import { describe, expect, it } from "vitest";
import {
  defaultConfig,
  makeOpts,
  makeReport,
  mockClearReadyDelay,
  mockClearStallState,
  mockRunCheck,
  mockUpdateReadyDelay,
  mockWriteStallState,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks(() => defaultConfig({ merge: { method: "squash" } }));

describe("runIterate — REST merge with unreadable queue policy", () => {
  it("waits under the stall timer and keeps the ready-delay instead of clearing state", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        transport: "rest",
        transportUnavailable: [{ field: "branchProtection", reason: "denied" }],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts({ merge: true, stallTimeoutSeconds: 600 }));

    expect(result.action).toBe("wait");
    expect(result.action === "wait" && result.log).toContain("could not read merge-queue policy");
    expect(mockWriteStallState).toHaveBeenCalled();
    expect(mockClearStallState).not.toHaveBeenCalled();
    expect(mockClearReadyDelay).not.toHaveBeenCalled();
  });
});
