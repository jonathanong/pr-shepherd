// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerHooks, BASE_OPTS, mockGetCurrentPrNumber } from "./resolve.test-support.mts";
import { runResolveFetch } from "./resolve.mts";

registerHooks();

describe("runResolveFetch — no PR", () => {
  it("throws when no open PR found", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    await expect(runResolveFetch(BASE_OPTS)).rejects.toThrow("No open PR found");
  });
});
