import { describe, it, expect } from "vitest";
import { joinSections } from "./markdown.mts";

describe("joinSections", () => {
  it("joins sections with double newline", () => {
    expect(joinSections(["a", "b", "c"])).toBe("a\n\nb\n\nc");
  });

  it("filters out null, undefined, and empty string", () => {
    expect(joinSections(["a", null, undefined, "", "b"])).toBe("a\n\nb");
  });

  it("collapses triple+ newlines to double", () => {
    expect(joinSections(["a\n\n\nb", "c"])).toBe("a\n\nb\n\nc");
    expect(joinSections(["a\n\n\n\nb"])).toBe("a\n\nb");
  });

  it("returns empty string for all-empty input", () => {
    expect(joinSections([null, undefined, ""])).toBe("");
  });

  it("returns no trailing newline", () => {
    const result = joinSections(["a", "b"]);
    expect(result.endsWith("\n")).toBe(false);
  });

  it("preserves internal single and double newlines within a section", () => {
    expect(joinSections(["## Heading\n\nBody text"])).toBe("## Heading\n\nBody text");
  });
});
