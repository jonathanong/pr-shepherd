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

  it("drops completed runs, external checks, released checks, and queue checks", () => {
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
    ]);
    expect(result.action).toBe("wait");
    expect(result.action === "wait" && result.log).toBe(
      "WAIT: PR #7 failing checks already shown; their workflow run is still running (run 900, 8) — waiting for it to complete",
    );
  });
});
