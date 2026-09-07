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

  it("scales factor bands from the configured poll interval", async () => {
    writeRc("poll:\n  intervalSeconds: 120\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().watch.graphqlQuotaWarnings).toEqual([
      { remainingPercent: 30, pollIntervalMinutes: 4 },
      { remainingPercent: 20, pollIntervalMinutes: 10 },
      { remainingPercent: 10, pollIntervalMinutes: 20 },
    ]);
  });

  it("accepts factor-only bands", async () => {
    writeRc(
      "poll:\n  intervalSeconds: 90\nwatch:\n  graphqlQuotaWarnings:\n    - remainingPercent: 40\n      pollIntervalFactor: 2\n    - remainingPercent: 5\n      pollIntervalFactor: 4\n",
    );
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().watch.graphqlQuotaWarnings).toEqual([
      { remainingPercent: 40, pollIntervalMinutes: 3 },
      { remainingPercent: 5, pollIntervalMinutes: 6 },
    ]);
  });

  it("uses the stricter absolute or factor floor when both are configured", async () => {
    writeRc(
      "poll:\n  intervalSeconds: 120\nwatch:\n  graphqlQuotaWarnings:\n    - remainingPercent: 30\n      pollIntervalMinutes: 3\n      pollIntervalFactor: 2\n    - remainingPercent: 10\n      pollIntervalMinutes: 30\n      pollIntervalFactor: 10\n",
    );
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().watch.graphqlQuotaWarnings).toEqual([
      { remainingPercent: 30, pollIntervalMinutes: 4 },
      { remainingPercent: 10, pollIntervalMinutes: 30 },
    ]);
  });

  it("rejects a factor calculation that overflows", async () => {
    writeRc(
      "poll:\n  intervalSeconds: 1e308\nwatch:\n  graphqlQuotaWarnings:\n    - remainingPercent: 30\n      pollIntervalFactor: 1e308\n",
    );
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().watch.graphqlQuotaWarnings).toEqual([
      { remainingPercent: 30, pollIntervalMinutes: 2 },
      { remainingPercent: 20, pollIntervalMinutes: 5 },
      { remainingPercent: 10, pollIntervalMinutes: 10 },
    ]);
  });

  it("can be disabled with an empty array", async () => {
    writeRc("watch:\n  graphqlQuotaWarnings: []\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().watch.graphqlQuotaWarnings).toEqual([]);
  });

  it.each([
    ["non-array value", "disabled"],
    ["non-object band", "\n    - disabled"],
    ["remaining percent", "\n    - remainingPercent: 0\n      pollIntervalMinutes: 2"],
    ["poll interval", "\n    - remainingPercent: 20\n      pollIntervalMinutes: 0"],
    ["missing interval policy", "\n    - remainingPercent: 20"],
    ["poll interval factor", "\n    - remainingPercent: 20\n      pollIntervalFactor: 0.5"],
    [
      "duplicate threshold",
      "\n    - remainingPercent: 20\n      pollIntervalMinutes: 2\n    - remainingPercent: 20\n      pollIntervalMinutes: 5",
    ],
    [
      "decreasing interval",
      "\n    - remainingPercent: 40\n      pollIntervalMinutes: 20\n    - remainingPercent: 5\n      pollIntervalMinutes: 1",
    ],
    [
      "decreasing resolved factor interval",
      "\n    - remainingPercent: 40\n      pollIntervalFactor: 10\n    - remainingPercent: 5\n      pollIntervalFactor: 2",
    ],
  ])("falls back to defaults for an invalid %s", async (_label, bands) => {
    writeRc(`watch:\n  graphqlQuotaWarnings:${bands.startsWith("\n") ? "" : " "}${bands}\n`);
    const loadConfig = await freshLoadConfig();

    expect(loadConfig().watch.graphqlQuotaWarnings).toEqual([
      { remainingPercent: 30, pollIntervalMinutes: 2 },
      { remainingPercent: 20, pollIntervalMinutes: 5 },
      { remainingPercent: 10, pollIntervalMinutes: 10 },
    ]);
  });
});
