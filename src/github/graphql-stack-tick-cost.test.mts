import { describe, expect, it } from "vitest";
import { wire } from "../../test-helpers/github/rest-read.test-support.mts";
import { freshLoadConfig } from "../../test-helpers/config/load-test-support.mts";
import {
  BOTTOM_HEAD,
  measure,
  operationOf,
  serveStack,
  type StackState,
} from "../../test-helpers/github/stack-tick.test-support.mts";

describe("GraphQL native-stack layer tick cost", () => {
  it("reads a layer above the trunk in one BatchPr request, cold or reused", async () => {
    await freshLoadConfig();
    const state: StackState = { updatedAt: "2026-10-09T00:00:00Z", trunkRequired: ["ci"] };
    await serveStack(state);
    const cold = await measure(false);
    expect(cold.operations).toEqual(["BatchPr"]);
    const warm = await measure(true);
    expect(warm.report).toMatchObject({ fingerprintReused: true });
    expect(warm.operations).toEqual(["BatchPr"]);
    expect(cold.report).not.toHaveProperty("unreportedRequiredChecks");
    expect(cold.report).not.toHaveProperty("trunkBehindBy");
  });

  it("compares the trunk only for an unreported required check, then reuses the count", async () => {
    await freshLoadConfig();
    const state: StackState = { updatedAt: "2026-10-09T00:00:00Z", trunkRequired: ["ci", "lint"] };
    await serveStack(state);
    const cold = await measure(false);
    expect(cold.report).toMatchObject({ unreportedRequiredChecks: ["lint"], trunkBehindBy: 3 });
    expect(cold.operations).toEqual(["BatchPr", "BaseBehind"]);
    const compare = wire.requests.find((request) => operationOf(request) === "BaseBehind");
    expect(compare?.body).toMatchObject({
      variables: { qualifiedName: "refs/heads/main", headRef: BOTTOM_HEAD },
    });
    for (const fingerprintCache of [true, false]) {
      const next = await measure(fingerprintCache);
      expect(next.report).toMatchObject({ unreportedRequiredChecks: ["lint"], trunkBehindBy: 3 });
      expect(next.operations).toEqual(["BatchPr"]);
    }
  });

  it("falls back to RefRules when the bottom entry's base is not the trunk", async () => {
    await freshLoadConfig();
    await serveStack({
      updatedAt: "2026-10-09T00:00:00Z",
      trunkRequired: ["ci", "lint"],
      bottomBase: "release",
    });
    const cold = await measure(false);
    expect(cold.operations).toEqual(["BatchPr", "RefRules"]);
    expect(cold.report).toMatchObject({ unreportedRequiredChecks: ["lint"], trunkBehindBy: 3 });
  });

  it("reads the topology when the stack outgrows BatchPr's entries page", async () => {
    await freshLoadConfig();
    await serveStack({
      updatedAt: "2026-10-09T00:00:00Z",
      trunkRequired: ["ci"],
      hasNextPage: true,
    });
    const cold = await measure(false);
    expect(cold.operations).toEqual(["BatchPr", "PollStackTopology"]);
  });
});
