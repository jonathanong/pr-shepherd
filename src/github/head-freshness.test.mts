import { describe, expect, it } from "vitest";
import { headFreshAtUnix } from "./head-freshness.mts";

const unix = (iso: string) => Date.parse(iso) / 1000;

describe("headFreshAtUnix", () => {
  it("takes the newest suite time across apps", () => {
    expect(
      headFreshAtUnix({
        suiteCreatedAts: ["2026-11-22T05:09:05Z", "2026-11-22T05:09:07Z", null, undefined],
      }),
    ).toBe(unix("2026-11-22T05:09:07Z"));
  });

  it("takes the newest of suites, force-push, and PR creation", () => {
    expect(
      headFreshAtUnix({
        suiteCreatedAts: ["2026-11-22T05:00:00Z"],
        forcePushedAtUnix: unix("2026-11-22T05:30:00Z"),
        prCreatedAt: "2026-11-22T05:10:00Z",
      }),
    ).toBe(unix("2026-11-22T05:30:00Z"));
  });

  it("falls back to PR creation when the head has no suite", () => {
    expect(headFreshAtUnix({ suiteCreatedAts: [], prCreatedAt: "2026-11-22T05:10:00Z" })).toBe(
      unix("2026-11-22T05:10:00Z"),
    );
  });

  it("ignores unparseable times and is undefined when nothing is known", () => {
    expect(headFreshAtUnix({ suiteCreatedAts: ["not-a-date", ""], forcePushedAtUnix: 0 })).toBe(
      undefined,
    );
    expect(headFreshAtUnix({ suiteCreatedAts: [], prCreatedAt: null })).toBe(undefined);
  });
});
