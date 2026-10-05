import { describe, expect, it } from "vitest";
import {
  forcePushUnix,
  headArrivalUnix,
  queueRemovalAppliesToHead,
} from "./queue-removal-freshness.mts";

const removedAtUnix = 1_700_000_000;

describe("headArrivalUnix", () => {
  it("uses the check time over a committer clock that runs ahead", () => {
    expect(headArrivalUnix({ headPushedAtUnix: 1_000, headCommittedAtUnix: 9_000 })).toBe(1_000);
  });

  it("prefers a later force-push over an earlier check time", () => {
    expect(headArrivalUnix({ headPushedAtUnix: 1_000, headForcePushedAtUnix: 2_000 })).toBe(2_000);
    expect(headArrivalUnix({ headPushedAtUnix: 3_000, headForcePushedAtUnix: 2_000 })).toBe(3_000);
  });

  it("falls back to the later of commit time and force-push", () => {
    expect(headArrivalUnix({ headCommittedAtUnix: 1_000, headForcePushedAtUnix: 2_000 })).toBe(
      2_000,
    );
    expect(headArrivalUnix({ headCommittedAtUnix: 1_000 })).toBe(1_000);
    expect(headArrivalUnix({ headForcePushedAtUnix: 2_000 })).toBe(2_000);
  });

  it("ignores missing, null, and zero times", () => {
    expect(headArrivalUnix({})).toBeUndefined();
    expect(
      headArrivalUnix({ headCommittedAtUnix: null, headPushedAtUnix: 0, headForcePushedAtUnix: 0 }),
    ).toBeUndefined();
  });
});

describe("queueRemovalAppliesToHead — force-push", () => {
  it("rejects a squash removal when an older commit was force-pushed back after it", () => {
    expect(
      queueRemovalAppliesToHead({
        parentOids: ["base-sha"],
        headOid: "pr-head",
        headCommittedAtUnix: removedAtUnix - 600,
        headPushedAtUnix: removedAtUnix - 300,
        headForcePushedAtUnix: removedAtUnix + 60,
        removedAtUnix,
      }),
    ).toBe(false);
  });
});

describe("queueRemovalAppliesToHead — same SHA force-pushed back", () => {
  it("rejects a merge-commit removal whose parent matches but was force-pushed back after it", () => {
    expect(
      queueRemovalAppliesToHead({
        parentOids: ["base-sha", "pr-head"],
        headOid: "pr-head",
        headForcePushedAtUnix: removedAtUnix + 60,
        removedAtUnix,
      }),
    ).toBe(false);
  });

  it("keeps a matching parent when the force-push came before the removal", () => {
    expect(
      queueRemovalAppliesToHead({
        parentOids: ["base-sha", "pr-head"],
        headOid: "pr-head",
        headForcePushedAtUnix: removedAtUnix - 60,
        removedAtUnix,
      }),
    ).toBe(true);
  });
});

describe("forcePushUnix", () => {
  it("parses the latest force-push time", () => {
    expect(forcePushUnix({ nodes: [{ createdAt: "2023-11-14T22:13:20Z" }] })).toBe(removedAtUnix);
  });

  it("returns undefined without a usable event", () => {
    expect(forcePushUnix(null)).toBeUndefined();
    expect(forcePushUnix({ nodes: [] })).toBeUndefined();
    expect(forcePushUnix({ nodes: [{ createdAt: "not a date" }] })).toBeUndefined();
  });
});
