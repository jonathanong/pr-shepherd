import { describe, expect, it } from "vitest";
import { buildNativeStackLayerRebase } from "./native-stack-rebase.mts";

const stack = { number: 7, size: 3, position: 2, baseRefName: "main" };
const unusable = { number: 42, baseBranch: undefined };

describe("buildNativeStackLayerRebase without a usable base name", () => {
  it("starts at the known bottom open layer instead of naming the base", () => {
    const step = buildNativeStackLayerRebase("acme/widgets", unusable, stack, undefined, 40);
    expect(step).toContain("check out the head branch of PR #40");
    expect(step).toContain("`gh stack rebase`");
  });

  it("starts at the bottom layer or trunk when an upper layer already contains its parent", () => {
    expect(
      buildNativeStackLayerRebase("acme/widgets", unusable, stack, { trunk: "main", bottomPr: 9 }),
    ).toContain("PR #9");
    expect(
      buildNativeStackLayerRebase("acme/widgets", unusable, stack, { trunk: "main" }),
    ).toContain("onto `main`");
  });

  it("prints no stack route when neither the bottom layer nor the base is known", () => {
    expect(buildNativeStackLayerRebase("acme/widgets", unusable, stack)).toBeUndefined();
  });
});
