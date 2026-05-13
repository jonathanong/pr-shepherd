// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerHooks, BASE_OPTS, mockGetCurrentPrNumber } from "./resolve.test-support.mts";
import { runResolveMutate } from "./resolve.mts";

registerHooks();

describe("runResolveMutate — no PR", () => {
  it("throws when no open PR found", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    await expect(runResolveMutate(BASE_OPTS)).rejects.toThrow("No open PR found");
  });
});
