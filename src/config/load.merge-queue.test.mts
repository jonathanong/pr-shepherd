import { describe, expect, it } from "vitest";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import { resolveConfig } from "./resolve.mts";

describe("merge-queue.compare-window-hours config", () => {
  it("defaults to 6 hours", () => {
    expect(resolveConfig({})["merge-queue"]["compare-window-hours"]).toBe(6);
  });

  it("accepts 0 to disable and positive integer or fractional hours", () => {
    expect(
      resolveConfig({ "merge-queue": { "compare-window-hours": 0 } })["merge-queue"][
        "compare-window-hours"
      ],
    ).toBe(0);
    expect(
      resolveConfig({ "merge-queue": { "compare-window-hours": 1.5 } })["merge-queue"][
        "compare-window-hours"
      ],
    ).toBe(1.5);
  });

  it("rejects negative numbers, wrong types, and unknown keys under merge-queue", () => {
    for (const bad of [
      { "merge-queue": { "compare-window-hours": -1 } },
      { "merge-queue": { "compare-window-hours": 721 } },
      { "merge-queue": { "compare-window-hours": "6" } },
      { "merge-queue": { compareWindowHours: 6 } },
    ]) {
      let caught: unknown;
      try {
        resolveConfig(bad, "test.yml");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ShepherdError);
      expect((caught as ShepherdError).exitCode).toBe(EXIT.CONFIG);
    }
  });
});
