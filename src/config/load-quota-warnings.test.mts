import { describe, expect, it } from "vitest";
import {
  expectConfigError,
  freshLoadConfig,
  writeRc,
} from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — GraphQL quota warnings", () => {
  it("defaults to 30/20/10 percent with 2/5/10 minute intervals", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().quotaWarningBands).toEqual([
      { remainingPercent: 30, pollIntervalMinutes: 2 },
      { remainingPercent: 20, pollIntervalMinutes: 5 },
      { remainingPercent: 10, pollIntervalMinutes: 10 },
    ]);
  });

  it("accepts custom bands and sorts them descending", async () => {
    writeRc(
      "poll:\n  quota-warnings:\n    - remaining-percent: 5\n      interval-minutes: 20\n    - remaining-percent: 40\n      interval-minutes: 3\n",
    );
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().quotaWarningBands).toEqual([
      { remainingPercent: 40, pollIntervalMinutes: 3 },
      { remainingPercent: 5, pollIntervalMinutes: 20 },
    ]);
  });

  it("scales factor bands from the configured poll interval", async () => {
    writeRc("poll:\n  interval-seconds: 120\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().quotaWarningBands).toEqual([
      { remainingPercent: 30, pollIntervalMinutes: 4 },
      { remainingPercent: 20, pollIntervalMinutes: 10 },
      { remainingPercent: 10, pollIntervalMinutes: 20 },
    ]);
  });

  it("accepts factor-only bands", async () => {
    writeRc(
      "poll:\n  interval-seconds: 90\n  quota-warnings:\n    - remaining-percent: 40\n      interval-factor: 2\n    - remaining-percent: 5\n      interval-factor: 4\n",
    );
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().quotaWarningBands).toEqual([
      { remainingPercent: 40, pollIntervalMinutes: 3 },
      { remainingPercent: 5, pollIntervalMinutes: 6 },
    ]);
  });

  it("uses the stricter absolute or factor floor when both are configured", async () => {
    writeRc(
      "poll:\n  interval-seconds: 120\n  quota-warnings:\n    - remaining-percent: 30\n      interval-minutes: 3\n      interval-factor: 2\n    - remaining-percent: 10\n      interval-minutes: 30\n      interval-factor: 10\n",
    );
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().quotaWarningBands).toEqual([
      { remainingPercent: 30, pollIntervalMinutes: 4 },
      { remainingPercent: 10, pollIntervalMinutes: 30 },
    ]);
  });

  it("rejects a factor calculation that overflows", async () => {
    writeRc(
      "poll:\n  interval-seconds: 60\n  quota-warnings:\n    - remaining-percent: 30\n      interval-factor: 1e308\n",
    );
    await expectConfigError("`poll.quota-warnings[0]`: resolves to a non-finite poll interval");
  });

  it("can be disabled with an empty array", async () => {
    writeRc("poll:\n  quota-warnings: []\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().quotaWarningBands).toEqual([]);
  });

  it.each([
    ["non-array value", "disabled"],
    ["non-object band", "\n    - disabled"],
    ["remaining percent", "\n    - remaining-percent: 0\n      interval-minutes: 2"],
    ["poll interval", "\n    - remaining-percent: 20\n      interval-minutes: 0"],
    ["missing interval policy", "\n    - remaining-percent: 20"],
    ["poll interval factor", "\n    - remaining-percent: 20\n      interval-factor: 0.5"],
    [
      "duplicate threshold",
      "\n    - remaining-percent: 20\n      interval-minutes: 2\n    - remaining-percent: 20\n      interval-minutes: 5",
    ],
    [
      "decreasing interval",
      "\n    - remaining-percent: 40\n      interval-minutes: 20\n    - remaining-percent: 5\n      interval-minutes: 1",
    ],
    [
      "decreasing resolved factor interval",
      "\n    - remaining-percent: 40\n      interval-factor: 10\n    - remaining-percent: 5\n      interval-factor: 2",
    ],
  ])("rejects an invalid %s", async (_label, bands) => {
    writeRc(`poll:\n  quota-warnings:${bands.startsWith("\n") ? "" : " "}${bands}\n`);
    await expectConfigError("`poll.quota-warnings");
  });
});
