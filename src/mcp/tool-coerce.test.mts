import { describe, it, expect } from "vitest";
import {
  optNum,
  reqNum,
  optStr,
  reqStr,
  optBool,
  optStringArray,
  reqNumArray,
} from "./tool-coerce.mts";

describe("optNum", () => {
  it("returns number when present", () => {
    expect(optNum({ n: 42 }, "n")).toBe(42);
  });

  it("returns undefined when missing", () => {
    expect(optNum({}, "n")).toBeUndefined();
  });

  it("returns undefined for non-number", () => {
    expect(optNum({ n: "42" }, "n")).toBeUndefined();
  });
});

describe("reqNum", () => {
  it("returns number when present", () => {
    expect(reqNum({ n: 7 }, "n")).toBe(7);
  });

  it("throws when missing", () => {
    expect(() => reqNum({}, "n")).toThrow("n is required and must be a number");
  });

  it("throws for non-number", () => {
    expect(() => reqNum({ n: "7" }, "n")).toThrow("n is required and must be a number");
  });
});

describe("optStr", () => {
  it("returns string when present", () => {
    expect(optStr({ s: "hello" }, "s")).toBe("hello");
  });

  it("returns undefined when missing", () => {
    expect(optStr({}, "s")).toBeUndefined();
  });

  it("returns undefined for non-string", () => {
    expect(optStr({ s: 42 }, "s")).toBeUndefined();
  });
});

describe("reqStr", () => {
  it("returns string when present", () => {
    expect(reqStr({ s: "hello" }, "s")).toBe("hello");
  });

  it("throws when missing", () => {
    expect(() => reqStr({}, "s")).toThrow("s is required and must be a non-empty string");
  });

  it("throws for empty string", () => {
    expect(() => reqStr({ s: "" }, "s")).toThrow("s is required and must be a non-empty string");
  });

  it("throws for non-string", () => {
    expect(() => reqStr({ s: 42 }, "s")).toThrow("s is required and must be a non-empty string");
  });
});

describe("optBool", () => {
  it("returns boolean when present", () => {
    expect(optBool({ b: true }, "b")).toBe(true);
    expect(optBool({ b: false }, "b")).toBe(false);
  });

  it("returns undefined when missing", () => {
    expect(optBool({}, "b")).toBeUndefined();
  });

  it("returns undefined for non-boolean", () => {
    expect(optBool({ b: 1 }, "b")).toBeUndefined();
  });
});

describe("optStringArray", () => {
  it("returns string array when present", () => {
    expect(optStringArray({ a: ["x", "y"] }, "a")).toEqual(["x", "y"]);
  });

  it("throws on non-string element", () => {
    expect(() => optStringArray({ a: ["x", 42, "y"] }, "a")).toThrow("a[1] must be a string");
  });

  it("returns undefined when not an array", () => {
    expect(optStringArray({ a: "x" }, "a")).toBeUndefined();
    expect(optStringArray({}, "a")).toBeUndefined();
  });
});

describe("reqNumArray", () => {
  it("returns number array when present", () => {
    expect(reqNumArray({ a: [1, 2, 3] }, "a")).toEqual([1, 2, 3]);
  });

  it("throws on non-number element", () => {
    expect(() => reqNumArray({ a: [1, "x", 2] }, "a")).toThrow("a[1] must be a number");
  });

  it("throws when missing", () => {
    expect(() => reqNumArray({}, "a")).toThrow("a must be a non-empty array of numbers");
  });

  it("throws for empty array", () => {
    expect(() => reqNumArray({ a: [] }, "a")).toThrow("a must be a non-empty array of numbers");
  });

  it("throws for non-array", () => {
    expect(() => reqNumArray({ a: "x" }, "a")).toThrow("a must be a non-empty array of numbers");
  });
});
