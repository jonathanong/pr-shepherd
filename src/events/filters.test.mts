import { describe, expect, it } from "vitest";
import { filtersFor, filtersParam } from "./filters.mts";

describe("filtersFor", () => {
  it("builds pr, sha and ref filters, de-duplicated", () => {
    expect(
      filtersFor([
        { repo: "a/b", pr: 1, headSha: "s", headRef: "h", baseRef: "main" },
        { repo: "a/b", pr: 2, headSha: "s", headRef: "h2", baseRef: "main" },
      ]),
    ).toEqual([{ pr: [1, 2] }, { sha: ["s"] }, { ref: ["h", "main", "h2"] }]);
  });

  it("omits sha and ref when unknown", () => {
    expect(filtersFor([{ repo: "a/b", pr: 1 }])).toEqual([{ pr: [1] }]);
  });
});

describe("filtersParam", () => {
  it("serializes within limits and refuses empty, too many, or too large", () => {
    expect(filtersParam([{ pr: [1] }])).toBe('[{"pr":[1]}]');
    expect(filtersParam([])).toBeUndefined();
    expect(filtersParam(Array.from({ length: 51 }, () => ({ pr: [1] })))).toBeUndefined();
    expect(filtersParam([{ ref: ["x".repeat(5000)] }])).toBeUndefined();
  });
});
