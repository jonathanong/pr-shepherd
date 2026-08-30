import { describe, expect, it } from "vitest";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — GraphQL quota warnings", () => {
  it("defaults to 30/20/10 percent with 2/5/10 minute intervals", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().watch.graphqlQuotaWarnings).toEqual([
      { remainingPercent: 30, pollIntervalMinutes: 2 },
      { remainingPercent: 20, pollIntervalMinutes: 5 },
      { remainingPercent: 10, pollIntervalMinutes: 10 },
    ]);
  });

  it("accepts custom bands and sorts them descending", async () => {
    writeRc(
      "watch:\n  graphqlQuotaWarnings:\n    - remainingPercent: 5\n      pollIntervalMinutes: 20\n    - remainingPercent: 40\n      pollIntervalMinutes: 3\n",
    );
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().watch.graphqlQuotaWarnings).toEqual([
      { remainingPercent: 40, pollIntervalMinutes: 3 },
      { remainingPercent: 5, pollIntervalMinutes: 20 },
    ]);
  });

  it("can be disabled with an empty array", async () => {
    writeRc("watch:\n  graphqlQuotaWarnings: []\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().watch.graphqlQuotaWarnings).toEqual([]);
  });
});
