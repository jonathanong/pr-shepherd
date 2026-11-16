import { describe, expect, it } from "vitest";
import type { AgentCheck, IterateResultBase } from "../../types.mts";
import { activeRunFailures, buildRunFailureWait } from "./run-failure-wait.mts";

const check = (over: Partial<AgentCheck>): AgentCheck =>
  ({ name: "CI / tests", runId: "900", conclusion: "FAILURE", ...over }) as AgentCheck;

describe("activeRunFailures", () => {
  const active = new Set(["900"]);

  it("keeps failures whose run is still running", () => {
    expect(activeRunFailures([check({})], active, new Set())).toHaveLength(1);
  });

  it("keeps an external status with a URL while any run is running", () => {
    const external = check({ runId: null, name: "codecov", detailsUrl: "https://c.io/1" });
    expect(activeRunFailures([external], active, new Set())).toHaveLength(1);
    expect(activeRunFailures([external], new Set(), new Set())).toEqual([]);
  });

  it("drops completed runs, URL-less externals, released checks, and queue checks", () => {
    const failing = [
      check({ runId: "901" }),
      check({ runId: null, name: "external" }),
      check({ name: "released" }),
      check({ name: "queue", scope: "merge_group" }),
    ];
    expect(activeRunFailures(failing, active, new Set(["released"]))).toEqual([]);
  });
});

describe("buildRunFailureWait", () => {
  it("names each distinct run once", () => {
    const base = { pr: 7 } as IterateResultBase;
    const result = buildRunFailureWait(base, [
      check({}),
      check({ name: "b" }),
      check({ runId: "8" }),
      check({ runId: null, name: "codecov" }),
    ]);
    expect(result.action).toBe("wait");
    expect(result.action === "wait" && result.log).toBe(
      "WAIT: PR #7 failing checks already shown; their workflow run is still running (run 900, run 8, codecov) — waiting for it to complete",
    );
  });
});
