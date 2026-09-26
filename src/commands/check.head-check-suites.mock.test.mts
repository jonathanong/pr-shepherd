import { describe, expect, it } from "vitest";
import {
  BASE_OPTS,
  makeBatchData,
  mockFetchPrBatch,
  registerHooks,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck head check suites", () => {
  it("copies a complete empty head check-suite page onto the report", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData(),
      headCheckSuitesEmpty: true,
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.headCheckSuitesEmpty).toBe(true);
  });
});
