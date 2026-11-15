import { describe, expect, it } from "vitest";
import { resolveConfig } from "./resolve.mts";

describe("cancel-run config keys", () => {
  it("defaults to cancelling superseded runs with nothing protected", () => {
    const config = resolveConfig({});
    expect(config.actions["cancel-runs-before-push"]).toBe(true);
    expect(config.checks["never-cancel"]).toEqual([]);
  });

  it("accepts the off switch and a never-cancel list", () => {
    const config = resolveConfig({
      actions: { "cancel-runs-before-push": false },
      checks: { "never-cancel": ["AI *"] },
    });
    expect(config.actions["cancel-runs-before-push"]).toBe(false);
    expect(config.checks["never-cancel"]).toEqual(["AI *"]);
  });

  it("rejects the old key with a hint naming checks.never-cancel", () => {
    expect(() => resolveConfig({ actions: { neverCancelRuns: ["x"] } })).toThrow(
      "checks.never-cancel",
    );
  });
});
