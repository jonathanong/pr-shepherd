import { describe, expect, it } from "vitest";
import { chooseMergeMethod, parseMergeMethod, readAllowedMergeMethods } from "./merge-method.mts";

describe("readAllowedMergeMethods", () => {
  it("stays unknown when the query did not select the settings", () => {
    expect(readAllowedMergeMethods(undefined)).toBeUndefined();
    expect(readAllowedMergeMethods({})).toBeUndefined();
  });

  it("lists only the methods the repository enables", () => {
    expect(
      readAllowedMergeMethods({
        mergeCommitAllowed: false,
        squashMergeAllowed: true,
        rebaseMergeAllowed: false,
      }),
    ).toEqual(["squash"]);
  });
});

describe("chooseMergeMethod", () => {
  it("keeps the historical default when settings were not loaded", () => {
    expect(chooseMergeMethod({ allowed: undefined, configured: null, fallback: "merge" })).toEqual({
      method: "merge",
    });
  });

  it("uses squash when merge commits are disabled and nothing is configured", () => {
    expect(chooseMergeMethod({ allowed: ["squash"], configured: null, fallback: "merge" })).toEqual(
      { method: "squash" },
    );
  });

  it("prefers the stack fallback when that method is allowed", () => {
    expect(
      chooseMergeMethod({
        allowed: ["merge", "squash"],
        configured: null,
        fallback: "squash",
      }),
    ).toEqual({ method: "squash" });
  });

  it("uses a configured method that the repository allows", () => {
    expect(
      chooseMergeMethod({ allowed: ["squash"], configured: "squash", fallback: "merge" }),
    ).toEqual({ method: "squash" });
  });

  it("reports a configured method the repository rejects", () => {
    expect(
      chooseMergeMethod({ allowed: ["squash"], configured: "merge", fallback: "merge" }),
    ).toEqual({
      unavailable:
        "Configured merge method `merge` is not allowed by this repository. Allowed methods: squash.",
    });
  });

  it("reports when every method is disabled", () => {
    expect(chooseMergeMethod({ allowed: [], configured: null, fallback: "merge" })).toEqual({
      unavailable:
        "This repository allows no merge method (merge commits, squash, and rebase are all disabled).",
    });
  });
});

describe("parseMergeMethod", () => {
  it("rejects an unknown method", () => {
    expect(() => parseMergeMethod("fast-forward")).toThrow(/merge, squash, or rebase/);
  });
});
