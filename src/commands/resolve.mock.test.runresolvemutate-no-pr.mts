// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  mockGetCurrentPrNumber,
  runResolveMutate,
} from "./resolve.test-support.mts";

registerHooks();

describe("runResolveMutate — no PR", () => {
  it("throws when no open PR found", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    await expect(runResolveMutate(BASE_OPTS)).rejects.toThrow("No open PR found");
  });
});
