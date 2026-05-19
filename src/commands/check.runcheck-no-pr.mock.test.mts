import { describe, it, expect } from "vitest";
import { registerHooks, BASE_OPTS, mockGetCurrentPrNumber } from "./check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — no PR", () => {
  it("throws when no PR number is found", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    await expect(runCheck(BASE_OPTS)).rejects.toThrow("No open PR found");
  });
});
