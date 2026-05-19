import { describe, it, expect } from "vitest";
import { joinSections } from "./markdown.mts";

describe("joinSections", () => {
  it("joins sections with double newline", () => {
    expect(joinSections(["a", "b", "c"])).toBe("a\n\nb\n\nc");
  });

  it("filters out null, undefined, and empty string", () => {
    expect(joinSections(["a", null, undefined, "", "b"])).toBe("a\n\nb");
  });

  it("trims leading and trailing newlines from each section", () => {
    expect(joinSections(["\n\na\n\n", "\nb\n"])).toBe("a\n\nb");
    expect(joinSections(["a\n", "b"])).toBe("a\n\nb");
  });

  it("preserves internal newlines within a section unchanged", () => {
    expect(joinSections(["a\n\n\nb", "c"])).toBe("a\n\n\nb\n\nc");
  });

  it("returns empty string for all-empty input", () => {
    expect(joinSections([null, undefined, ""])).toBe("");
  });

  it("filters out sections that become empty after trimming newlines", () => {
    expect(joinSections(["\n\n", "a", "\n"])).toBe("a");
    expect(joinSections(["\r\n\r\n", "a", "\r\n"])).toBe("a");
  });

  it("does not add a trailing newline when joining plain sections", () => {
    const result = joinSections(["a", "b"]);
    expect(result.endsWith("\n")).toBe(false);
  });

  it("preserves internal single and double newlines within a section", () => {
    expect(joinSections(["## Heading\n\nBody text"])).toBe("## Heading\n\nBody text");
  });
});
