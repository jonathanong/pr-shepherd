import { describe, expect, it } from "vitest";
import { queueRemovalAppliesToHead } from "./queue-removal-freshness.mts";

const removedAtUnix = 1_700_000_000;

describe("queueRemovalAppliesToHead", () => {
  it("accepts a merge-commit queue whose parents include the current head", () => {
    expect(
      queueRemovalAppliesToHead({
        parentOids: ["base-sha", "pr-head"],
        headOid: "pr-head",
      }),
    ).toBe(true);
  });

  it("rejects a merge-commit queue after the head moves", () => {
    expect(
      queueRemovalAppliesToHead({
        parentOids: ["base-sha", "pr-head-at-removal"],
        headOid: "new-head",
      }),
    ).toBe(false);
  });

  it("accepts a single-parent squash or rebase commit when the head is unchanged", () => {
    expect(
      queueRemovalAppliesToHead({
        parentOids: ["base-sha"],
        headOid: "pr-head",
        headCommittedAtUnix: removedAtUnix - 60,
        removedAtUnix,
      }),
    ).toBe(true);
  });

  it("rejects a single-parent commit after a later push", () => {
    expect(
      queueRemovalAppliesToHead({
        parentOids: ["base-sha"],
        headOid: "pr-head",
        headCommittedAtUnix: removedAtUnix + 60,
        removedAtUnix,
      }),
    ).toBe(false);
  });

  it("rejects a removal whose queue commit GitHub no longer returns", () => {
    expect(queueRemovalAppliesToHead({ parentOids: undefined, headOid: "pr-head" })).toBe(false);
    expect(queueRemovalAppliesToHead({ parentOids: [], headOid: "pr-head" })).toBe(false);
  });
});
