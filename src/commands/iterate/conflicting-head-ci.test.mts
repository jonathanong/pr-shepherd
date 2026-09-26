import { describe, expect, it } from "vitest";
import {
  conflictingHeadCiNote,
  countReportedChecks,
  insertConflictingHeadCiNote,
} from "./conflicting-head-ci.mts";

const nowMs = 1_700_000_000_000;
const oldEnough = Math.floor(nowMs / 1000) - 121;
const emptyChecks = {
  passing: [],
  failing: [],
  inProgress: [],
  skipped: [],
  filtered: [],
};

describe("conflictingHeadCiNote", () => {
  const ready = {
    hasConflicts: true,
    headCheckSuitesEmpty: true,
    checkRunCount: 0,
    firstSeenAtUnix: oldEnough,
    nowMs,
  };

  it("names a conflicting head that never received CI after the grace period", () => {
    expect(conflictingHeadCiNote(ready)).toContain("did not start pull_request workflows");
  });

  it("stays quiet inside the grace period and when CI evidence exists", () => {
    expect(
      conflictingHeadCiNote({
        ...ready,
        firstSeenAtUnix: Math.floor(nowMs / 1000),
      }),
    ).toBeUndefined();
    expect(conflictingHeadCiNote({ ...ready, hasConflicts: false })).toBeUndefined();
    expect(conflictingHeadCiNote({ ...ready, headCheckSuitesEmpty: false })).toBeUndefined();
    expect(conflictingHeadCiNote({ ...ready, checkRunCount: 1 })).toBeUndefined();
    expect(conflictingHeadCiNote({ ...ready, firstSeenAtUnix: undefined })).toBeUndefined();
    expect(conflictingHeadCiNote({ ...ready, firstSeenAtUnix: Number.NaN })).toBeUndefined();
  });

  it("counts every reported check bucket, including ignored", () => {
    expect(countReportedChecks({ ...emptyChecks, ignored: [{}] })).toBe(1);
    expect(countReportedChecks({ ...emptyChecks, failing: [{}], skipped: [{}] })).toBe(2);
  });

  it("inserts the note after the conflict step, or first when that step is absent", () => {
    const steps = ["repair", "The branch has merge conflicts.", "push"];
    insertConflictingHeadCiNote(steps, "no ci");
    expect(steps).toEqual(["repair", "The branch has merge conflicts.", "no ci", "push"]);
    const other = ["push"];
    insertConflictingHeadCiNote(other, "no ci");
    expect(other).toEqual(["no ci", "push"]);
    insertConflictingHeadCiNote(other, undefined);
    expect(other).toEqual(["no ci", "push"]);
  });
});
