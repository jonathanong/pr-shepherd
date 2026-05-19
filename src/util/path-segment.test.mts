import { describe, it, expect } from "vitest";
import { SAFE_SEGMENT } from "./path-segment.mts";

describe("SAFE_SEGMENT", () => {
  it.each([
    "abc",
    "ABC",
    "123",
    "my-repo",
    "my_repo",
    "my.repo",
    "jonathanong",
    "pr-shepherd",
    "v1.2.3",
  ])("accepts %s", (value) => {
    expect(SAFE_SEGMENT.test(value)).toBe(true);
  });

  it.each([
    ["empty string", ""],
    ["forward slash", "a/b"],
    ["space", "a b"],
    ["unicode", "héllo"],
    ["null byte", "a\0b"],
    ["at sign", "a@b"],
  ])("rejects %s", (_label, value) => {
    expect(SAFE_SEGMENT.test(value)).toBe(false);
  });
});
