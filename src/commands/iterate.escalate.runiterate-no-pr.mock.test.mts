import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  mockGetCurrentPrNumber,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// Escalate
// ---------------------------------------------------------------------------

describe("runIterate — no PR", () => {
  it("throws when no PR number is passed and no current PR is found", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    await expect(runIterate({ format: "json" })).rejects.toThrow("No open PR found");
  });
});
