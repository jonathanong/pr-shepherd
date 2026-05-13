// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  mockGetCurrentPrNumber,
  runCheck,
} from "./check.test-support.mts";

registerHooks();

describe("runCheck — no PR", () => {
  it("throws when no PR number is found", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    await expect(runCheck(BASE_OPTS)).rejects.toThrow("No open PR found");
  });
});
