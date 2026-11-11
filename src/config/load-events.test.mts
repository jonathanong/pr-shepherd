import { describe, expect, it } from "vitest";
import {
  expectConfigError,
  freshLoadConfig,
  writeRc,
} from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — events", () => {
  it("is off by default with a 300 second fallback", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().events).toEqual({ source: "none", "fallback-interval-seconds": 300 });
  });

  it("accepts hook-harness and a fallback interval", async () => {
    writeRc("events:\n  source: hook-harness\n  fallback-interval-seconds: 120\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().events).toEqual({
      source: "hook-harness",
      "fallback-interval-seconds": 120,
    });
  });

  it.each([
    "events:\n  source: github\n",
    "events:\n  fallback-interval-seconds: 0\n",
    "events:\n  fallback-interval-seconds: 86401\n",
    "events:\n  fallbackIntervalSeconds: 60\n",
    "events:\n  url: https://example.com\n",
  ])("rejects %j", async (yaml) => {
    writeRc(yaml);
    await expectConfigError("`events");
  });
});
