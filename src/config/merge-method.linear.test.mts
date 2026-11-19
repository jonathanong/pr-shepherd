import { describe, expect, it } from "vitest";
import { chooseMergeMethod } from "./merge-method.mts";

describe("chooseMergeMethod under required linear history", () => {
  const base = { configured: null, fallback: "merge", linearHistory: true } as const;

  it("never defaults to a merge commit, even when merge commits are allowed", () => {
    expect(chooseMergeMethod({ ...base, allowed: ["merge", "squash"] })).toEqual({
      method: "squash",
    });
    expect(chooseMergeMethod({ ...base, allowed: ["merge", "rebase"] })).toEqual({
      method: "rebase",
    });
  });

  it("picks squash when the repository settings are unknown", () => {
    expect(chooseMergeMethod({ ...base, allowed: undefined })).toEqual({ method: "squash" });
    expect(chooseMergeMethod({ ...base, allowed: undefined, fallback: "rebase" })).toEqual({
      method: "rebase",
    });
    expect(chooseMergeMethod({ ...base, allowed: undefined, configured: "rebase" })).toEqual({
      method: "rebase",
    });
  });

  it("rejects a configured merge commit", () => {
    expect(
      chooseMergeMethod({ ...base, allowed: ["merge", "squash"], configured: "merge" }),
    ).toEqual({
      unavailable:
        "Configured merge method `merge` conflicts with the required linear history; use `squash` or `rebase`.",
    });
  });

  it("reports when only merge commits are allowed", () => {
    expect(chooseMergeMethod({ ...base, allowed: ["merge"] })).toEqual({
      unavailable:
        "Required linear history excludes merge commits, and this repository allows no squash or rebase merge.",
    });
  });
});
