import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeCheck,
  mockFetchPrBatch,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — blockedByFilteredCheck", () => {
  it("sets blockedByFilteredCheck=true when BLOCKED + no failing/in-progress + filtered checks exist", async () => {
    const filteredCheck = makeCheck({ category: "filtered", event: "push" });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        mergeStateStatus: "BLOCKED",
        checks: [filteredCheck],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.checks.blockedByFilteredCheck).toBe(true);
  });
});
