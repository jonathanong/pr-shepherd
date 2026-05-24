import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  mockGetCurrentPrNumber,
} from "../../test-helpers/commands/resolve.test-support.mts";
import { runResolveFetch } from "./resolve.mts";

registerHooks();

describe("runResolveFetch — no PR", () => {
  it("throws when no open PR found", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    await expect(runResolveFetch(BASE_OPTS)).rejects.toThrow("No open PR found");
  });
});
