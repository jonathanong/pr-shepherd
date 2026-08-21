import { describe, it, expect } from "vitest";
import { SAFE_PR_NUMBER, SAFE_SEGMENT } from "./path-segment.mts";

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

describe("SAFE_PR_NUMBER", () => {
  it.each(["1", "42", "123456"])("accepts %s", (value) => {
    expect(SAFE_PR_NUMBER.test(value)).toBe(true);
  });

  it.each([
    ["empty string", ""],
    ["zero", "0"],
    ["leading zero", "01"],
    ["negative", "-1"],
    ["decimal", "1.5"],
    ["traversal", "../etc"],
    ["NaN", "NaN"],
  ])("rejects %s", (_label, value) => {
    expect(SAFE_PR_NUMBER.test(value)).toBe(false);
  });
});
